/**
 * Citizen Dashboard — focused behavioral tests (Phase 3)
 *
 * Tests verify:
 * - Authenticated citizen sees the dashboard (not a redirect)
 * - Loading skeleton renders while data fetches
 * - Empty state shown when no pickups exist
 * - Active pickup card appears with the correct status
 * - PickupTimeline renders inside the active card
 * - Request Pickup CTA is present and links to /pickups/new
 * - Completed pickups count shows in summary
 * - Notifications section appears when unread notifications exist
 * - Core section survives an API failure (error state + retry)
 * - Role redirects still fire for non-citizen roles
 *
 * NOTE: api calls are mocked via jest.mock. AuthContext is mocked to
 * control user/token state without a real JWT.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "@/app/(app)/dashboard/page";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      myPickups:          jest.fn(),
      pointsBalance:      jest.fn(),
      notifications:      jest.fn(),
      environmentalImpact: jest.fn(),
      cancelPickup:       jest.fn(),
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockCitizenAuth() {
  (useAuth as jest.Mock).mockReturnValue({
    token: "test-token",
    user: { full_name: "Alice Nakato", role: "CITIZEN", email: "alice@example.com" },
    loading: false,
  });
}

const EMPTY_PICKUPS = { items: [], total: 0 };

const REQUESTED_PICKUP = {
  id: "p-1",
  waste_category: "PLASTIC",
  status: "REQUESTED",
  address_text: "Plot 12, Ntinda",
  preferred_date: null,
  preferred_time_window: null,
  notes: null,
  assigned_collector_id: null,
  latitude: 0.34,
  longitude: 32.58,
  created_at: new Date("2026-09-01T10:00:00Z").toISOString(),
  requester_user_id: "u-1",
};

const COLLECTED_PICKUP = {
  ...REQUESTED_PICKUP,
  id: "p-2",
  status: "COLLECTED",
  created_at: new Date("2026-08-20T08:00:00Z").toISOString(),
};

function mockDefaultApiResponses() {
  (api.myPickups as jest.Mock).mockResolvedValue(EMPTY_PICKUPS);
  (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 0 });
  (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
  (api.environmentalImpact as jest.Mock).mockResolvedValue({
    diversion_rate_percent: 42,
    estimated_co2e_avoided_kg: 18.5,
    is_estimate: true,
    total_waste_collected_kg: 100,
    total_waste_recycled_kg: 42,
    note: "estimate",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  pushMock.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DashboardPage — citizen", () => {
  it("renders the greeting for an authenticated citizen", async () => {
    mockCitizenAuth();
    mockDefaultApiResponses();
    render(<DashboardPage />);

    // Greeting should include first name
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alice")
    );
  });

  it("shows the primary Request a Pickup link", async () => {
    mockCitizenAuth();
    mockDefaultApiResponses();
    render(<DashboardPage />);

    // There may be multiple links to /pickups/new — at least one must exist
    await waitFor(() => {
      const links = screen.getAllByRole("link", { name: /request a pickup/i });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute("href", "/pickups/new");
    });
  });

  it("shows skeleton cards while data is loading", () => {
    mockCitizenAuth();
    // Never resolve — keep loading state
    (api.myPickups as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.pointsBalance as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.notifications as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.environmentalImpact as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />);

    // aria-hidden skeleton cards are rendered but not announced
    // We check the loading sentence in the hero instead
    expect(screen.getByText(/loading your pickups/i)).toBeInTheDocument();
  });

  it("shows empty-state when citizen has no pickups", async () => {
    mockCitizenAuth();
    mockDefaultApiResponses();
    render(<DashboardPage />);

    await waitFor(() =>
      // Use exact title text from EmptyState component
      expect(screen.getByText("No active pickup")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText(/no pickups yet/i)).toBeInTheDocument()
    );
  });

  it("shows the active pickup card with the correct category and status", async () => {
    mockCitizenAuth();
    (api.myPickups as jest.Mock).mockResolvedValue({ items: [REQUESTED_PICKUP], total: 1 });
    (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 50 });
    (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (api.environmentalImpact as jest.Mock).mockResolvedValue({
      diversion_rate_percent: 30, estimated_co2e_avoided_kg: 10, is_estimate: true,
      total_waste_collected_kg: 80, total_waste_recycled_kg: 24, note: "",
    });

    render(<DashboardPage />);

    // Category shown in card
    await waitFor(() =>
      expect(screen.getByText(/plastic collection/i)).toBeInTheDocument()
    );

    // Status badge — use getAllByText since "Requested" also appears in the PickupTimeline
    await waitFor(() =>
      expect(screen.getAllByText("Requested").length).toBeGreaterThanOrEqual(1)
    );

    // Cancel link only when REQUESTED
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancel this pickup/i })).toBeInTheDocument()
    );
  });

  it("renders the PickupTimeline inside the active pickup card", async () => {
    mockCitizenAuth();
    (api.myPickups as jest.Mock).mockResolvedValue({ items: [REQUESTED_PICKUP], total: 1 });
    (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 0 });
    (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (api.environmentalImpact as jest.Mock).mockResolvedValue({
      diversion_rate_percent: 0, estimated_co2e_avoided_kg: 0, is_estimate: true,
      total_waste_collected_kg: 0, total_waste_recycled_kg: 0, note: "",
    });

    render(<DashboardPage />);

    // Timeline step labels — use getAllByText since "Requested" also appears in StatusBadge
    await waitFor(() => {
      expect(screen.getAllByText("Requested").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Assigned").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("En route").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows completed pickup count in stats", async () => {
    mockCitizenAuth();
    (api.myPickups as jest.Mock).mockResolvedValue({
      items: [COLLECTED_PICKUP, { ...COLLECTED_PICKUP, id: "p-3" }],
      total: 2,
    });
    (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 120 });
    (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (api.environmentalImpact as jest.Mock).mockResolvedValue({
      diversion_rate_percent: 55, estimated_co2e_avoided_kg: 22, is_estimate: true,
      total_waste_collected_kg: 100, total_waste_recycled_kg: 55, note: "",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      // "2" stat value for completed pickups
      expect(screen.getByText("2")).toBeInTheDocument();
      // points
      expect(screen.getByText("120")).toBeInTheDocument();
    });
  });

  it("shows unread notifications when they exist", async () => {
    mockCitizenAuth();
    mockDefaultApiResponses();
    (api.notifications as jest.Mock).mockResolvedValue({
      items: [
        { id: "n-1", title: "Pickup assigned", body: "A collector has been assigned.", is_read: false, created_at: new Date().toISOString() },
        { id: "n-2", title: "Route started", body: "Your collector is on the way.", is_read: false, created_at: new Date().toISOString() },
      ],
      total: 2,
    });

    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText("Pickup assigned")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("Route started")).toBeInTheDocument()
    );
  });

  it("does NOT show notifications section when all are read", async () => {
    mockCitizenAuth();
    mockDefaultApiResponses();
    (api.notifications as jest.Mock).mockResolvedValue({
      items: [
        { id: "n-1", title: "Old", body: "Already read.", is_read: true, created_at: new Date().toISOString() },
      ],
      total: 1,
    });

    render(<DashboardPage />);

    await waitFor(() => expect(api.notifications).toHaveBeenCalled());
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
  });

  it("shows inline error when pickups API fails and offers retry", async () => {
    mockCitizenAuth();
    (api.myPickups as jest.Mock).mockRejectedValue(new Error("Network error"));
    (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 0 });
    (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (api.environmentalImpact as jest.Mock).mockResolvedValue({
      diversion_rate_percent: 0, estimated_co2e_avoided_kg: 0, is_estimate: true,
      total_waste_collected_kg: 0, total_waste_recycled_kg: 0, note: "",
    });

    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText(/could not load your pickup data/i)).toBeInTheDocument()
    );

    // Retry button
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();

    // Clicking retry re-calls the API
    (api.myPickups as jest.Mock).mockResolvedValue(EMPTY_PICKUPS);
    await userEvent.click(retryBtn);
    await waitFor(() => expect(api.myPickups).toHaveBeenCalledTimes(2));
  });

  it("redirects COLLECTOR role away from /dashboard", () => {
    (useAuth as jest.Mock).mockReturnValue({
      token: "tok",
      user: { full_name: "Bob", role: "COLLECTOR" },
      loading: false,
    });
    mockDefaultApiResponses();
    render(<DashboardPage />);
    expect(pushMock).toHaveBeenCalledWith("/collector");
  });

  it("redirects SUPER_ADMIN role away from /dashboard", () => {
    (useAuth as jest.Mock).mockReturnValue({
      token: "tok",
      user: { full_name: "Admin", role: "SUPER_ADMIN" },
      loading: false,
    });
    mockDefaultApiResponses();
    render(<DashboardPage />);
    expect(pushMock).toHaveBeenCalledWith("/admin");
  });

  it("returns null when not authenticated (loading=false, token=null)", () => {
    (useAuth as jest.Mock).mockReturnValue({ token: null, user: null, loading: false });
    const { container } = render(<DashboardPage />);
    expect(container.firstChild).toBeNull();
  });

  it("calls cancelPickup API when cancel button is clicked", async () => {
    mockCitizenAuth();
    (api.myPickups as jest.Mock).mockResolvedValue({ items: [REQUESTED_PICKUP], total: 1 });
    (api.pointsBalance as jest.Mock).mockResolvedValue({ points_balance: 0 });
    (api.notifications as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    (api.environmentalImpact as jest.Mock).mockResolvedValue({
      diversion_rate_percent: 0, estimated_co2e_avoided_kg: 0, is_estimate: true,
      total_waste_collected_kg: 0, total_waste_recycled_kg: 0, note: "",
    });
    (api.cancelPickup as jest.Mock).mockResolvedValue({ ...REQUESTED_PICKUP, status: "CANCELLED" });
    // Second call returns the updated (cancelled) list
    (api.myPickups as jest.Mock)
      .mockResolvedValueOnce({ items: [REQUESTED_PICKUP], total: 1 })
      .mockResolvedValue({ items: [{ ...REQUESTED_PICKUP, status: "CANCELLED" }], total: 1 });

    render(<DashboardPage />);

    const cancelBtn = await screen.findByRole("button", { name: /cancel this pickup/i });
    await userEvent.click(cancelBtn);

    await waitFor(() =>
      expect(api.cancelPickup).toHaveBeenCalledWith("test-token", "p-1")
    );
  });
});
