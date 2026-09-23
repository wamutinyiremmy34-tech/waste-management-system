import type { ReactNode } from "react";
import { CollectorUser, CollectorProfile } from "./types";
import StatusBadge, { PickupStatus } from "@/components/ui/StatusBadge";

interface CollectorHeaderProps {
  user: CollectorUser;
  profile: CollectorProfile | null;
  activeCount: number;
  totalCount: number;
}

const SHIFT_STATUS_LABELS: Record<string, string> = {
  IDLE: "Shift idle",
  ACTIVE: "On route",
  PAUSED: "Paused",
};

function deriveShiftStatus(active: number, total: number): "IDLE" | "ACTIVE" {
  if (active === 0 && total === 0) return "IDLE";
  return active > 0 ? "ACTIVE" : "IDLE";
}

export function CollectorHeader({
  user,
  activeCount,
  totalCount,
}: CollectorHeaderProps): ReactNode {
  const shift = deriveShiftStatus(activeCount, totalCount);
  const shiftBadgeStatus: PickupStatus = shift === "ACTIVE" ? "EN_ROUTE" : "ASSIGNED";

  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
          Collector dashboard
        </p>
        <h1 className="mt-0.5 truncate text-xl font-bold text-stone-900 sm:text-2xl">
          Hi, {user.full_name || "Operator"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {user.email}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={shiftBadgeStatus} label={SHIFT_STATUS_LABELS[shift]} />
      </div>
    </header>
  );
}

export default CollectorHeader;
