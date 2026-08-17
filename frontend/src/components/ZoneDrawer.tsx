"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

// Reference bounding box for the click canvas — centered on the
// Kampala/Wakiso/Mukono area used throughout this project's seed data and
// demo content. Maps a click's pixel position linearly to a real lat/lng,
// so every point drawn is a genuine coordinate submitted to the real API —
// this is not a mock/placeholder tool, just a lightweight alternative to a
// full slippy-map library (no react-leaflet/Mapbox dependency exists in
// this project yet; adding one is a reasonable future upgrade noted in
// docs/architecture.md-style comments, not done here to keep this addition
// self-contained).
const LAT_MIN = 0.28;
const LAT_MAX = 0.42;
const LNG_MIN = 32.52;
const LNG_MAX = 32.66;
const SVG_WIDTH = 480;
const SVG_HEIGHT = 360;

function pixelToLatLng(x: number, y: number): [number, number] {
  const lng = LNG_MIN + (x / SVG_WIDTH) * (LNG_MAX - LNG_MIN);
  // SVG y grows downward; latitude grows upward, so invert.
  const lat = LAT_MAX - (y / SVG_HEIGHT) * (LAT_MAX - LAT_MIN);
  return [lat, lng];
}

function latLngToPixel(lat: number, lng: number): [number, number] {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_WIDTH;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_HEIGHT;
  return [x, y];
}

interface ZoneDrawerProps {
  token: string;
  wasteCompanyId: string;
  onZoneCreated: () => void;
}

export function ZoneDrawer({ token, wasteCompanyId, onZoneCreated }: ZoneDrawerProps) {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]); // [lat, lng][]
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints((prev) => [...prev, pixelToLatLng(x, y)]);
  }

  function undoLastPoint() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function resetDrawing() {
    setPoints([]);
    setName("");
    setError(null);
  }

  async function saveZone() {
    if (points.length < 3) {
      setError("Click at least 3 points to draw a zone boundary.");
      return;
    }
    if (!name.trim()) {
      setError("Give the zone a name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Internal `points` state is [lat, lng] (matches pixelToLatLng's
      // return order, used for the SVG rendering math below). The backend's
      // ZoneCreateRequest expects [lng, lat] pairs (confirmed by reading
      // the exact unpacking in app/api/v1/zones.py — `for lng, lat in
      // payload.boundary_coordinates` — not assumed), so this explicitly
      // swaps the order at the submission boundary rather than storing
      // lng/lat internally and risking a mix-up in the pixel-math functions
      // above, which are easier to get right when consistently lat-first.
      const closedRing: [number, number][] = [...points, points[0]];
      const boundary_coordinates: [number, number][] = closedRing.map(([lat, lng]) => [lng, lat]);
      await api.createZone(token, { name, waste_company_id: wasteCompanyId, boundary_coordinates });
      resetDrawing();
      setDrawing(false);
      onZoneCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that zone.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!drawing) {
    return (
      <button
        onClick={() => setDrawing(true)}
        className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
      >
        Draw new zone
      </button>
    );
  }

  const pixelPoints = points.map(([lat, lng]) => latLngToPixel(lat, lng));
  const polygonPoints = pixelPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="mb-2 text-sm text-stone-600">
        Click on the map to place boundary points, in order, around the zone. Needs at least 3
        points.
      </p>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        height={SVG_HEIGHT}
        className="cursor-crosshair rounded-md border border-stone-300 bg-emerald-50"
        onClick={handleCanvasClick}
      >
        {pixelPoints.length >= 2 && (
          <polygon points={polygonPoints} fill="rgba(45,106,79,0.25)" stroke="#1b4332" strokeWidth={2} />
        )}
        {pixelPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill="#1b4332" stroke="white" strokeWidth={1.5} />
        ))}
      </svg>

      <div className="mt-3">
        <label className="block text-xs font-medium text-stone-700">Zone name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ntinda-Nakawa Zone"
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={saveZone}
          disabled={submitting}
          className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f] disabled:opacity-50"
        >
          {submitting ? "Saving..." : `Save zone (${points.length} point${points.length === 1 ? "" : "s"})`}
        </button>
        <button
          onClick={undoLastPoint}
          disabled={points.length === 0}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 disabled:opacity-50"
        >
          Undo last point
        </button>
        <button
          onClick={() => {
            resetDrawing();
            setDrawing(false);
          }}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
