import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { LocationState } from "./types";

interface LocationWorkflowProps {
  locationState: LocationState;
  hasActivePickups: boolean;
  onStartRoute: () => void;
  starting?: boolean;
}

function LocationBanner({
  tone,
  children,
}: {
  tone: "info" | "success" | "warn" | "error";
  children: ReactNode;
}): ReactNode {
  const classes = (() => {
    switch (tone) {
      case "success":
        return "border-emerald-200 bg-emerald-50 text-emerald-800";
      case "warn":
        return "border-amber-200 bg-amber-50 text-amber-800";
      case "error":
        return "border-red-200 bg-red-50 text-red-700";
      case "info":
      default:
        return "border-blue-200 bg-blue-50 text-blue-800";
    }
  })();
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${classes}`}
    >
      {children}
    </div>
  );
}

export function LocationWorkflow({
  locationState,
  hasActivePickups,
  onStartRoute,
  starting = false,
}: LocationWorkflowProps): ReactNode {
  if (locationState === "idle") {
    if (!hasActivePickups) return null;
    return (
      <Button
        size="lg"
        loading={starting}
        onClick={onStartRoute}
        className="w-full"
        aria-label="Start route and check in my current location"
      >
        📍 Start route — check in my location
      </Button>
    );
  }

  switch (locationState) {
    case "requesting":
      return (
        <LocationBanner tone="info">Requesting location permission…</LocationBanner>
      );
    case "updating":
      return (
        <LocationBanner tone="info">Updating your location…</LocationBanner>
      );
    case "done":
      return (
        <LocationBanner tone="success">
          ✓ Location checked in. Route optimised from your current position.
        </LocationBanner>
      );
    case "denied":
      return (
        <LocationBanner tone="warn">
          Location permission denied. Showing pickups in default order. Your browser or
          device settings blocked location access.
        </LocationBanner>
      );
    case "timeout":
      return (
        <LocationBanner tone="warn">
          Location timed out. Showing pickups in default order. Try again when you have
          a clear GPS signal.
        </LocationBanner>
      );
    case "unavailable":
      return (
        <LocationBanner tone="warn">
          Location not available on this device. Showing pickups in default order.
        </LocationBanner>
      );
    case "offline":
      return (
        <LocationBanner tone="warn">
          You&apos;re offline. Location check-in skipped — using cached pickups.
        </LocationBanner>
      );
    case "error":
      return (
        <LocationBanner tone="error">
          Could not send your location. Showing pickups in default order.
        </LocationBanner>
      );
    default:
      return null;
  }
}

export default LocationWorkflow;
