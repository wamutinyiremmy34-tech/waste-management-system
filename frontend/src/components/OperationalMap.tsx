"use client";

/**
 * OperationalMap — Leaflet-based geographic intelligence view.
 *
 * Renders PostGIS-backed operational data on an OpenStreetMap base layer.
 * Uses react-leaflet with SSR disabled (Leaflet requires window).
 *
 * Layers:
 *   - Zone boundaries (GeoJSON polygons from /zones/geojson)
 *   - Bins (markers coloured by fill level)
 *   - Complaints (markers coloured by category)
 *   - Active pickups (markers coloured by status)
 *   - Hotspots (circle markers sized by complaint count)
 *
 * Performance: capped at 200 complaints, 200 bins, 100 pickups server-side.
 * At pilot scale this is fine. Clustering is available but not required.
 *
 * Tile attribution: © OpenStreetMap contributors (required by OSM licence).
 */

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Type definitions (mirrors API responses)
// ---------------------------------------------------------------------------
export interface MapComplaint {
  id: string;
  latitude: number;
  longitude: number;
  category: string;
  status: string;
}

export interface MapBin {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
  status: string;
  current_fill_percent: number;
  bin_type: string;
}

export interface MapPickup {
  id: string;
  latitude: number;
  longitude: number;
  status: string;
  waste_category: string;
  address_text: string | null;
}

export interface MapHotspot {
  cluster_id: number;
  complaint_count: number;
  latitude: number;
  longitude: number;
}

export interface ZoneFeature {
  type: "Feature";
  properties: { id: string; name: string; waste_company_id: string; is_active: boolean };
  geometry: object;
}

export interface ZoneGeoJSON {
  type: "FeatureCollection";
  features: ZoneFeature[];
}

interface OperationalMapProps {
  complaints: MapComplaint[];
  bins: MapBin[];
  pickups: MapPickup[];
  hotspots: MapHotspot[];
  zones: ZoneGeoJSON | null;
  /** Optional: show a collector's current check-in location */
  collectorLocation?: { latitude: number; longitude: number } | null;
  /** Active layer toggles */
  showZones?: boolean;
  showBins?: boolean;
  showComplaints?: boolean;
  showPickups?: boolean;
  showHotspots?: boolean;
  height?: string;
  /** Kampala centre default */
  centre?: [number, number];
  zoom?: number;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
function binColour(fill: number): string {
  if (fill >= 90) return "#dc2626";  // red — full
  if (fill >= 70) return "#d97706";  // amber — nearly full
  if (fill >= 40) return "#2563eb";  // blue — moderate
  return "#16a34a";                   // green — low
}

function complaintColour(category: string): string {
  const map: Record<string, string> = {
    ILLEGAL_DUMPING: "#7c3aed",
    OVERFLOWING_BIN: "#d97706",
    MISSED_COLLECTION: "#2563eb",
    DAMAGED_BIN: "#6b7280",
    ENVIRONMENTAL_HAZARD: "#dc2626",
    OTHER: "#6b7280",
  };
  return map[category] ?? "#6b7280";
}

// ---------------------------------------------------------------------------
// The actual Leaflet map — only rendered client-side
// ---------------------------------------------------------------------------
export default function OperationalMap({
  complaints,
  bins,
  pickups,
  hotspots,
  zones,
  collectorLocation,
  showZones = true,
  showBins = true,
  showComplaints = true,
  showPickups = true,
  showHotspots = true,
  height = "500px",
  centre = [0.3350, 32.5950], // Kampala
  zoom = 12,
}: OperationalMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const layersRef = useRef<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  // Leaflet requires window — lazy import on client only
  useEffect(() => {
    import("leaflet").then(() => {
      // All markers in this component use L.divIcon with inline HTML —
      // the default L.Icon.Default PNG markers are never rendered here.
      // No CDN or external asset dependency for marker images.
      setLeafletReady(true);
    }).catch(() => setError("Map library failed to load. The rest of the application still works."));
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;

    // Prevent double-init on hot reload
    if (mapInstanceRef.current) {
      // @ts-expect-error leaflet map instance
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      // Create map
      const map = L.map(mapRef.current, { preferCanvas: true }).setView(centre, zoom);
      mapInstanceRef.current = map;

      // OSM base layer — free, no API key, attribution required
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const newLayers: unknown[] = [];

      // ── Zone boundaries ──────────────────────────────────────────────────
      if (showZones && zones && zones.features.length > 0) {
        const zoneLayer = L.geoJSON(zones as unknown as Parameters<typeof L.geoJSON>[0], {
          style: {
            color: "#1b4332",
            weight: 2,
            fillColor: "#2d6a4f",
            fillOpacity: 0.08,
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties?.name) {
              layer.bindPopup(
                `<strong>${feature.properties.name}</strong><br/>Zone boundary`
              );
            }
          },
        }).addTo(map);
        newLayers.push(zoneLayer);
      }

      // ── Hotspot circles ──────────────────────────────────────────────────
      if (showHotspots) {
        hotspots.forEach((h) => {
          const radius = Math.min(400, 100 + h.complaint_count * 50);
          const circle = L.circle([h.latitude, h.longitude], {
            radius,
            color: "#b45309",
            fillColor: "#fbbf24",
            fillOpacity: 0.35,
            weight: 2,
          })
            .bindPopup(
              `<strong>Complaint Hotspot</strong><br/>
               ${h.complaint_count} complaint${h.complaint_count !== 1 ? "s" : ""}<br/>
               <em>Spatial cluster — PostGIS ST_ClusterDBSCAN</em>`
            )
            .addTo(map);
          newLayers.push(circle);
        });
      }

      // ── Complaint markers ────────────────────────────────────────────────
      if (showComplaints) {
        complaints.forEach((c) => {
          const colour = complaintColour(c.category);
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:12px;height:12px;border-radius:50%;background:${colour};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          const marker = L.marker([c.latitude, c.longitude], { icon })
            .bindPopup(
              `<strong>${c.category.replace(/_/g, " ")}</strong><br/>
               Status: ${c.status.replace(/_/g, " ")}`
            )
            .addTo(map);
          newLayers.push(marker);
        });
      }

      // ── Bin markers ──────────────────────────────────────────────────────
      if (showBins) {
        bins.forEach((b) => {
          const colour = binColour(b.current_fill_percent);
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:10px;height:14px;border-radius:2px;background:${colour};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
            iconSize: [10, 14],
            iconAnchor: [5, 7],
          });
          const marker = L.marker([b.latitude, b.longitude], { icon })
            .bindPopup(
              `<strong>Bin ${b.code}</strong><br/>
               Type: ${b.bin_type}<br/>
               Fill: ${b.current_fill_percent}%<br/>
               Status: ${b.status}`
            )
            .addTo(map);
          newLayers.push(marker);
        });
      }

      // ── Active pickup markers ────────────────────────────────────────────
      if (showPickups) {
        pickups.forEach((p) => {
          const colour = p.status === "REQUESTED" ? "#6b7280" : "#2563eb";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:11px;height:11px;border-radius:2px;background:${colour};border:2px solid #fff;transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
            iconSize: [11, 11],
            iconAnchor: [5, 5],
          });
          const marker = L.marker([p.latitude, p.longitude], { icon })
            .bindPopup(
              `<strong>Pickup</strong><br/>
               ${p.waste_category}<br/>
               ${p.address_text ?? ""}<br/>
               Status: ${p.status}`
            )
            .addTo(map);
          newLayers.push(marker);
        });
      }

      // ── Collector location ───────────────────────────────────────────────
      if (collectorLocation) {
        const colIcon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#1b4332;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.5)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker(
          [collectorLocation.latitude, collectorLocation.longitude],
          { icon: colIcon }
        )
          .bindPopup("<strong>Your location</strong>")
          .addTo(map);
        newLayers.push(marker);
      }

      layersRef.current = newLayers;
    });

    return () => {
      if (mapInstanceRef.current) {
        // @ts-expect-error leaflet map instance
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, complaints, bins, pickups, hotspots, zones, collectorLocation,
      showZones, showBins, showComplaints, showPickups, showHotspots]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-500"
        style={{ height }}
      >
        {error}
      </div>
    );
  }

  if (!leafletReady) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-400"
        style={{ height }}
      >
        Loading map…
      </div>
    );
  }

  return <div ref={mapRef} style={{ height, width: "100%", borderRadius: "0.5rem" }} />;
}
