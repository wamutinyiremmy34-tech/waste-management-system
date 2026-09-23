import type { ReactNode } from "react";
import { StatCard } from "@/components/ui/StatCard";
import type { DashboardShiftStats } from "./types";

interface ShiftOverviewProps {
  stats: DashboardShiftStats;
  className?: string;
}

export function ShiftOverview({ stats, className = "" }: ShiftOverviewProps): ReactNode {
  const completionRate =
    stats.total > 0 ? Math.round(((stats.completed || 0) / stats.total) * 100) : 0;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-800">Shift overview</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Active jobs"
          value={stats.active}
          supporting="Currently in progress"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          highlight
          supporting="Successfully collected"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          warn={stats.failed > 0}
          supporting="Failed pickups"
        />
        <StatCard
          label="Completion rate"
          value={`${completionRate}%`}
          highlight={completionRate >= 60}
          warn={completionRate < 40 && stats.total > 0}
          supporting={`${stats.total - stats.active} of ${stats.total || 0} resolved`}
        />
      </div>
    </div>
  );
}

export default ShiftOverview;
