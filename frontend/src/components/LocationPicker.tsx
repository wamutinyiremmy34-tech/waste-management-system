"use client";

/**
 * LocationPicker — reusable location selection for citizen flows.
 *
 * Capabilities (matching actual backend: lat + lng are required, no reverse
 * geocoding, no map tap-to-place):
 *   1. Browser geolocation "Use my current location" button with:
 *      - granted (resolve → coords)
 *      - denied (show helpful message → manual fallback)
 *      - timeout (10s, show message → fallback)
 *      - unavailable / offline → fallback
 *   2. Manual numeric latitude/longitude inputs with range validation
 *   3. Optional address text field (stored as free string; not geocoded)
 *   4. Summary card when coords are set so the user can confirm placement
 *
 * Controlled via props (parent owns state) so it can be embedded inside a
 * larger form without a duplicate local copy of the data.
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, ErrorState } from "@/components/ui";

export interface LocationValue {
  latitude: number | null;
  longitude: number | null;
  address?: string;
}

type GeoErrorKind = "denied" | "timeout" | "unavailable" | null;

interface LocationPickerProps {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** Optional in-app field-level validation errors (from parent step validation) */
  error?: string | null;
  /** Label for the control group — defaults to "Pickup location" */
  label?: string;
  /** Hint text shown below the heading */
  description?: string;
  /** If true, omits the free-text address input (complaints flow doesn't need it) */
  hideAddress?: boolean;
  className?: string;
}

function locationIconSvg(className: string = "h-5 w-5"): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function validateCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) {
    return "Please set a location before continuing.";
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "Latitude must be between -90 and 90.";
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

export function LocationPicker({
  value,
  onChange,
  error,
  label = "Pickup location",
  description = "Use your device's location, or enter coordinates manually.",
  hideAddress = false,
  className = "",
}: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorKind>(null);
  const [showManual, setShowManual] = useState(
    value.latitude !== null && value.longitude !== null ? false : true
  );

  const groupLabelId = useId();
  const fieldErrorId = useId();

  // Clear transient geolocation errors once the user has valid coords.
  useEffect(() => {
    if (value.latitude !== null && value.longitude !== null) {
      setGeoError(null);
    }
  }, [value.latitude, value.longitude]);

  function requestGeolocation() {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("unavailable");
      setShowManual(true);
      return;
    }
    setLocating(true);
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setLocating(false);
      setGeoError("timeout");
      setShowManual(true);
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setLocating(false);
        onChange({
          ...value,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setShowManual(false);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("denied");
        } else {
          setGeoError("unavailable");
        }
        setShowManual(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    );
  }

  function onManualLatLngChange(which: "lat" | "lng", raw: string) {
    const parsed = raw.trim() === "" ? null : Number(raw);
    const next: LocationValue = { ...value };
    if (which === "lat") next.latitude = parsed;
    else next.longitude = parsed;
    onChange(next);
  }

  const coordsError =
    error ??
    (value.latitude !== null || value.longitude !== null
      ? validateCoords(value.latitude, value.longitude)
      : null);

  const isCoordsSet =
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180;

  const geoErrorMsg =
    geoError === "denied"
      ? "Location permission was denied. Please enter the location manually below."
      : geoError === "timeout"
        ? "Locating your device took too long. Please check your signal or enter coordinates manually."
        : geoError === "unavailable"
          ? "Your browser or device doesn't support automatic location right now. Enter coordinates manually instead."
          : null;

  return (
    <fieldset
      className={`space-y-3 disabled:opacity-70 ${className}`.trim()}
      aria-labelledby={groupLabelId}
    >
      <legend id={groupLabelId} className="mb-1">
        <div className="flex items-center gap-2 text-base font-semibold text-stone-800">
          <span className="text-eco-800" aria-hidden="true">
            {locationIconSvg("h-5 w-5")}
          </span>
          <span>{label}</span>
        </div>
        {description && (
          <p className="mt-0.5 pl-7 text-sm text-stone-500">{description}</p>
        )}
      </legend>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          onClick={requestGeolocation}
          loading={locating}
          className="w-full sm:w-auto"
        >
          {locating ? "Locating device…" : "Use my current location"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowManual((v) => !v)}
          aria-expanded={showManual}
          className="w-full sm:w-auto"
        >
          {showManual ? "Hide manual entry" : "Enter coordinates manually"}
        </Button>
      </div>

      {geoErrorMsg && (
        <ErrorState title="Could not detect location" message={geoErrorMsg} />
      )}

      {showManual && (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${groupLabelId}-lat`}
                className="block text-sm font-medium text-stone-700"
              >
                Latitude
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id={`${groupLabelId}-lat`}
                type="number"
                step="any"
                min={-90}
                max={90}
                inputMode="decimal"
                autoComplete="off"
                value={value.latitude ?? ""}
                onChange={(e) => onManualLatLngChange("lat", e.target.value)}
                placeholder="e.g. 0.3476"
                aria-invalid={!!coordsError || undefined}
                aria-describedby={coordsError ? fieldErrorId : undefined}
                className="mt-1 w-full min-h-[44px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
              />
              <p className="mt-1 text-xs text-stone-400">Range: -90 to 90</p>
            </div>
            <div>
              <label
                htmlFor={`${groupLabelId}-lng`}
                className="block text-sm font-medium text-stone-700"
              >
                Longitude
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id={`${groupLabelId}-lng`}
                type="number"
                step="any"
                min={-180}
                max={180}
                inputMode="decimal"
                autoComplete="off"
                value={value.longitude ?? ""}
                onChange={(e) => onManualLatLngChange("lng", e.target.value)}
                placeholder="e.g. 32.5825"
                aria-invalid={!!coordsError || undefined}
                aria-describedby={coordsError ? fieldErrorId : undefined}
                className="mt-1 w-full min-h-[44px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
              />
              <p className="mt-1 text-xs text-stone-400">Range: -180 to 180</p>
            </div>
          </div>
        </div>
      )}

      {!hideAddress && (
        <div>
          <label
            htmlFor={`${groupLabelId}-addr`}
            className="block text-sm font-medium text-stone-700"
          >
            Address or cross-streets
            <span className="ml-1 text-stone-400 text-xs">(optional)</span>
          </label>
          <input
            id={`${groupLabelId}-addr`}
            type="text"
            value={value.address ?? ""}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            placeholder="e.g. Plot 12, Ntinda Road, Kampala"
            maxLength={500}
            className="mt-1 w-full min-h-[44px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
          />
          <p className="mt-1 text-xs text-stone-400">
            Helps the collector find you. Stored as free text, not looked up.
          </p>
        </div>
      )}

      {isCoordsSet && (
        <div
          className="flex items-start gap-3 rounded-lg border border-eco-200 bg-eco-50 p-3"
          aria-live="polite"
        >
          <span
            className="mt-0.5 shrink-0 rounded-full bg-eco-100 p-1 text-eco-800"
            aria-hidden="true"
          >
            {locationIconSvg("h-3.5 w-3.5")}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-eco-900">Location confirmed</p>
            <p className="text-eco-800" aria-label="Coordinates">
              Lat {value.latitude!.toFixed(6)}, Lng {value.longitude!.toFixed(6)}
            </p>
            {value.address && value.address.trim() !== "" && (
              <p className="mt-0.5 text-eco-700 truncate">
                {value.address.trim()}
              </p>
            )}
          </div>
        </div>
      )}

      {coordsError && (
        <p
          id={fieldErrorId}
          role="alert"
          className="text-sm text-red-600"
        >
          {coordsError}
        </p>
      )}
    </fieldset>
  );
}

export default LocationPicker;
