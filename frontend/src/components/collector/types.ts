import type { ReactNode } from "react";
import { UserOut } from "@/lib/api";
import { PickupStatus } from "@/components/ui/StatusBadge";

export type LocationState =
  | "idle"
  | "requesting"
  | "updating"
  | "done"
  | "denied"
  | "unavailable"
  | "timeout"
  | "offline"
  | "error";

export interface QueuedAction {
  id: string;
  pickupId: string;
  type: "status_update" | "complete_collection" | "fail_collection";
  payload: Record<string, unknown>;
  queuedAt: string;
  lastError?: string;
}

export interface RouteStop {
  sequence: number;
  pickup_id: string;
  status: string;
  waste_category: string;
  address_text: string | null;
  latitude: number;
  longitude: number;
}

export interface CollectorProfile {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface OfflineQueueState {
  isOnline: boolean;
  pending: QueuedAction[];
  syncing: boolean;
  queueOrSend: (
    type: QueuedAction["type"],
    pickupId: string,
    payload: Record<string, unknown>,
    sendNow: () => Promise<void>
  ) => Promise<void>;
  flush: () => Promise<void>;
}

export interface DashboardShiftStats {
  active: number;
  completed: number;
  failed: number;
  missed: number;
  total: number;
}

export interface CollectorUser extends UserOut {}

export interface DashboardSectionProps {
  children: ReactNode;
  className?: string;
}
