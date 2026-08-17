const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export { API_BASE };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ? JSON.stringify(body.detail) : detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  organization_id: string | null;
  waste_company_id: string | null;
  recycler_id: string | null;
}

export interface PickupOut {
  id: string;
  requester_user_id: string;
  waste_category: string;
  status: string;
  address_text: string | null;
  preferred_date: string | null;
  preferred_time_window: string | null;
  notes: string | null;
  assigned_collector_id: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
}

/**
 * Downloads an authenticated file (CSV/PDF report) as a real browser
 * download. A plain <a href> can't attach the Bearer token to a navigation,
 * so this fetches the file as a blob, then triggers the save via a
 * temporary object URL.
 */
export async function downloadAuthenticatedFile(path: string, token: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new ApiError(res.status, `Could not download ${filename}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    phone_number?: string;
    role: "CITIZEN" | "COLLECTOR";
  }) => request<UserOut>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),

  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  me: (token: string) => request<UserOut>("/auth/me", { token }),

  requestPickup: (
    token: string,
    payload: {
      waste_category: string;
      latitude: number;
      longitude: number;
      address_text?: string;
      notes?: string;
    }
  ) => request<PickupOut>("/pickups", { method: "POST", token, body: JSON.stringify(payload) }),

  createRecurringSchedule: (
    token: string,
    payload: {
      frequency: string;
      waste_category: string;
      latitude: number;
      longitude: number;
      address_text?: string;
      first_run_date: string;
    }
  ) =>
    request<{ id: string; frequency: string; next_run_date: string | null; is_active: boolean }>(
      "/recurring-schedules",
      { method: "POST", token, body: JSON.stringify(payload) }
    ),

  myRecurringSchedules: (token: string) =>
    request<
      { id: string; frequency: string; waste_category: string; address_text: string | null; next_run_date: string | null; is_active: boolean }[]
    >("/recurring-schedules/mine", { token }),

  deactivateRecurringSchedule: (token: string, scheduleId: string) =>
    request(`/recurring-schedules/${scheduleId}/deactivate`, { method: "PATCH", token }),

  myPickups: (token: string) =>
    request<{ items: PickupOut[]; total: number }>("/pickups/mine", { token }),

  assignedPickups: (token: string) =>
    request<{ items: PickupOut[]; total: number }>("/pickups/assigned", { token }),

  updatePickupStatus: (token: string, pickupId: string, status: string) =>
    request<PickupOut>(`/pickups/${pickupId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }),

  completeCollection: (
    token: string,
    pickupId: string,
    payload: { quantity_kg: number; waste_category?: string; completion_notes?: string }
  ) =>
    request<{ id: string; was_successful: boolean }>(`/pickups/${pickupId}/complete`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  failCollection: (token: string, pickupId: string, failure_reason: string) =>
    request<{ id: string; was_successful: boolean }>(`/pickups/${pickupId}/fail`, {
      method: "POST",
      token,
      body: JSON.stringify({ failure_reason }),
    }),

  myCollectorProfile: (token: string) =>
    request<{ id: string; latitude: number | null; longitude: number | null }>("/collectors/me", { token }),

  adminDashboard: (token: string) =>
    request<{
      total_users: number;
      active_users: number;
      total_collections: number;
      completed_collections: number;
      missed_collections: number;
      waste_collected_kg: number;
      recycled_waste_kg: number;
      complaints_total: number;
      unresolved_complaints: number;
    }>("/analytics/admin-dashboard", { token }),

  wasteByCategory: (token: string) => request<Record<string, number>>("/analytics/waste-by-category", { token }),

  complaintAnalytics: (token: string) =>
    request<{
      by_category: Record<string, number>;
      by_status: Record<string, number>;
      resolution_rate_percent: number;
    }>("/analytics/complaint-analytics", { token }),

  listComplaints: (token: string, status?: string) =>
    request<{
      items: {
        id: string;
        category: string;
        description: string;
        status: string;
        created_at: string;
      }[];
      total: number;
    }>(`/complaints${status ? `?status=${status}` : ""}`, { token }),

  updateComplaintStatus: (token: string, complaintId: string, status: string, resolution_notes?: string) =>
    request(`/complaints/${complaintId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status, resolution_notes }),
    }),

  myCompanyProfile: (token: string, companyId: string) =>
    request<{ id: string; name: string; is_active: boolean }>(`/companies/${companyId}`, { token }),

  companyDashboard: (token: string, companyId: string) =>
    request<{
      total_collectors: number;
      total_vehicles: number;
      pending_pickups: number;
      completed_pickups: number;
    }>(`/companies/${companyId}/dashboard`, { token }),

  listVehicles: (token: string) =>
    request<
      { id: string; registration_number: string; vehicle_type: string; capacity_kg: number | null; status: string }[]
    >("/vehicles", { token }),

  registerVehicle: (token: string, payload: { registration_number: string; vehicle_type: string; capacity_kg?: number }) =>
    request<{ id: string; registration_number: string; status: string }>("/vehicles", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  updateVehicleStatus: (token: string, vehicleId: string, status: string) =>
    request(`/vehicles/${vehicleId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }),

  createCollectorProfile: (token: string, userId: string) =>
    request<{ id: string; user_id: string }>("/collectors", {
      method: "POST",
      token,
      body: JSON.stringify({ user_id: userId }),
    }),

  listCollectors: (token: string) =>
    request<
      { id: string; user_id: string; assigned_zone_id: string | null; assigned_vehicle_id: string | null; is_active: boolean }[]
    >("/collectors", { token }),

  listZones: (token: string, wasteCompanyId?: string) =>
    request<{ id: string; name: string; waste_company_id: string; is_active: boolean }[]>(
      `/zones${wasteCompanyId ? `?waste_company_id=${wasteCompanyId}` : ""}`,
      { token }
    ),

  createZone: (
    token: string,
    payload: { name: string; waste_company_id: string; boundary_coordinates: [number, number][] }
  ) =>
    request<{ id: string; name: string; waste_company_id: string; is_active: boolean }>("/zones", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  myOrganizationProfile: (token: string, organizationId: string) =>
    request<{ id: string; name: string; org_type: string; is_active: boolean }>(`/organizations/${organizationId}`, {
      token,
    }),

  organizationWasteAnalytics: (token: string, organizationId: string) =>
    request<{ organization_id: string; total_waste_kg: number; by_category_kg: Record<string, number> }>(
      `/organizations/${organizationId}/waste-analytics`,
      { token }
    ),

  addOrganizationLocation: (
    token: string,
    organizationId: string,
    payload: { label: string; latitude: number; longitude: number; address_text?: string }
  ) =>
    request<{ id: string; label: string }>(`/organizations/${organizationId}/locations`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  listOrganizationStaff: (token: string, organizationId: string) =>
    request<{ id: string; email: string; full_name: string; phone_number: string | null; is_active: boolean }[]>(
      `/organizations/${organizationId}/staff`,
      { token }
    ),

  addOrganizationStaff: (
    token: string,
    organizationId: string,
    payload: { email: string; full_name: string; phone_number?: string }
  ) =>
    request<{ id: string; email: string; full_name: string }>(`/organizations/${organizationId}/staff`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  deactivateOrganizationStaff: (token: string, organizationId: string, userId: string) =>
    request(`/organizations/${organizationId}/staff/${userId}/deactivate`, {
      method: "PATCH",
      token,
    }),

  recyclingImpactSummary: (token: string) =>
    request<{
      total_waste_collected_kg: number;
      total_waste_recycled_kg: number;
      diversion_rate_percent: number;
      recycled_by_category_kg: Record<string, number>;
      note: string;
    }>("/recycling/impact-summary", { token }),

  myRecyclingRecords: (token: string) =>
    request<
      { id: string; waste_category: string; quantity_kg: number; received_date: string; destination: string | null }[]
    >("/recycling", { token }),

  recordRecycling: (
    token: string,
    payload: { waste_category: string; quantity_kg: number; received_date: string; destination?: string }
  ) =>
    request<{ id: string; waste_category: string; quantity_kg: number }>("/recycling", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),

  cancelPickup: (token: string, pickupId: string) =>
    request<PickupOut>(`/pickups/${pickupId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status: "CANCELLED" }),
    }),

  notifications: (token: string) =>
    request<{ items: { id: string; title: string; body: string; is_read: boolean; created_at: string }[]; total: number }>(
      "/notifications",
      { token }
    ),

  pointsBalance: (token: string) =>
    request<{ points_balance: number }>("/rewards/balance", { token }),
};
