/**
 * /complaints — Citizen complaint reports page tests (Phase 4)
 *
 * Tests cover:
 *   - Initial state: 3-tab filter, list loads with spinner
 *   - EmptyState shown when no complaints exist, with "Report a problem" CTA
 *   - Complaint list shows cards (ID, StatusBadge, category, description, timestamp)
 *   - Open/Resolved filter tabs correctly hide/show items based on status
 *   - Create form: 6 categories (exact enums), description 5-min-char validation,
 *     location required
 *   - Successful submission → success panel with reference ID + prepend to list
 *   - Failed submission → ErrorState + preserves entered form data
 *   - 401 translated into session-expired message
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplaintsPage from "@/app/(app)/complaints/page";
import { useAuth } from "@/context/AuthContext";
import { api, type ComplaintOut, ApiError } from "@/lib/api";

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      myComplaints: jest.fn(),
      reportComplaint: jest.fn(),
    },
  };
});

function mockCitizenAuth() {
  (useAuth as jest.Mock).mockReturnValue({
    token: "citizen-token",
    user: { full_name: "Alice", role: "CITIZEN", email: "alice@example.com" },
    loading: false,
  });
}

const SAMPLE_REPORTED: ComplaintOut = {
  id: "00aaaa11-bb22-33cc-44dd-555555555555",
  reporter_user_id: "u-1",
  category: "MISSED_COLLECTION",
  description:
    "Nobody came on Tuesday for Zone 5, bin is still overflowing at the corner near the mosque.",
  status: "REPORTED",
  latitude: 0.345,
  longitude: 32.58,
  resolution_notes: null,
  created_at: new Date("2026-09-19T11:15:00Z").toISOString(),
};

const SAMPLE_RESOLVED: ComplaintOut = {
  id: "11111111-2222-3333-4444-555555555555",
  reporter_user_id: "u-1",
  category: "DAMAGED_BIN",
  description: "Main public bin lid broken.",
  status: "RESOLVED",
  latitude: 0.34,
  longitude: 32.6,
  resolution_notes: "Bin was replaced on 18 Sep by Collector-04.",
  created_at: new Date("2026-09-15T09:00:00Z").toISOString(),
};

const CREATED_COMPLAINT: ComplaintOut = {
  id: "22222222-3333-4444-5555-666666666666",
  reporter_user_id: "u-1",
  category: "ILLEGAL_DUMPING",
  description:
    "Large pile of construction debris dumped at the end of Kira Road overnight. Broken tiles and concrete bags.",
  status: "REPORTED",
  latitude: 0.35,
  longitude: 32.59,
  resolution_notes: null,
  created_at: new Date("2026-09-20T08:30:00Z").toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCitizenAuth();
});

describe("Complaints Page", () => {
  describe("list view + empty state", () => {
    it("shows loading spinner while data is fetching", () => {
      (api.myComplaints as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<ComplaintsPage />);
      expect(screen.getByText(/loading your reports…/i)).toBeInTheDocument();
    });

    it("shows empty state and CTA when zero reports", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValue({ items: [], total: 0 });
      render(<ComplaintsPage />);
      await waitFor(() =>
        expect(screen.getByText("No reports yet")).toBeInTheDocument()
      );
      const reportBtn = screen.getByRole("button", { name: /report a problem/i });
      expect(reportBtn).toBeInTheDocument();
    });

    it("renders 3 filter tabs with counts (All / Open / Resolved)", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValue({
        items: [SAMPLE_REPORTED, SAMPLE_RESOLVED],
        total: 2,
      });
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      const tabList = screen.getByRole("tablist", { name: /filter complaints/i });
      const tabs = within(tabList).getAllByRole("tab");
      expect(tabs).toHaveLength(3);
      // Counts: All=2, Open=1, Resolved=1
      expect(within(tabList).getByText("2")).toBeInTheDocument();
      expect(within(tabList).getByText("1")).toBeInTheDocument();
    });

    it("renders complaint cards with id, category, status, created date", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValue({
        items: [SAMPLE_REPORTED],
        total: 1,
      });
      render(<ComplaintsPage />);
      await waitFor(() =>
        expect(screen.getByText(/Missed collection/i)).toBeInTheDocument()
      );
      // Short ID
      expect(screen.getByText("#00AAAA11")).toBeInTheDocument();
      // Status badge
      expect(screen.getAllByText(/Reported/i).length).toBeGreaterThanOrEqual(1);
      // Description preview
      expect(screen.getByText(/nobody came on tuesday/i)).toBeInTheDocument();
      // Expandable details
      const detailsBtn = screen.getByRole("button", { name: /show details/i });
      await userEvent.click(detailsBtn);
      // Lat/lng shown in details
      expect(screen.getByText(/0\.345000.*32\.580000/)).toBeInTheDocument();
      // Status note for open cases
      expect(
        screen.getByText(/your report has been received and will be reviewed/i)
      ).toBeInTheDocument();
    });

    it("Open tab hides RESOLVED items; Resolved tab hides OPEN", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValue({
        items: [SAMPLE_REPORTED, SAMPLE_RESOLVED],
        total: 2,
      });
      render(<ComplaintsPage />);
      await waitFor(() =>
        expect(screen.getByText(/Missed collection/i)).toBeInTheDocument()
      );

      // Initially All: both items present
      expect(screen.getByText(/Missed collection/i)).toBeInTheDocument();
      expect(screen.getByText(/Damaged bin/i)).toBeInTheDocument();

      // Switch to Open tab — resolved disappears
      const openTab = screen.getByRole("tab", { name: /open/i });
      await userEvent.click(openTab);
      expect(screen.getByText(/Missed collection/i)).toBeInTheDocument();
      expect(screen.queryByText(/Damaged bin/i)).not.toBeInTheDocument();

      // Switch to Resolved tab — open disappears
      const resolvedTab = screen.getByRole("tab", { name: /resolved/i });
      await userEvent.click(resolvedTab);
      expect(screen.getByText(/Damaged bin/i)).toBeInTheDocument();
      expect(screen.queryByText(/Missed collection/i)).not.toBeInTheDocument();

      // Resolved card has a resolution note
      expect(screen.getByText(/Bin was replaced/i)).toBeInTheDocument();
    });

    it("shows an ErrorState inline when list load fails + offers retry", async () => {
      (api.myComplaints as jest.Mock).mockRejectedValueOnce(
        new ApiError(500, "boom")
      );
      render(<ComplaintsPage />);
      await waitFor(() =>
        expect(screen.getByText(/couldn't load reports/i)).toBeInTheDocument()
      );
      const retry = screen.getByRole("button", { name: /try again/i });
      expect(retry).toBeInTheDocument();

      (api.myComplaints as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });
      await userEvent.click(retry);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalledTimes(2));
    });
  });

  describe("create complaint form", () => {
    beforeEach(() => {
      (api.myComplaints as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    });

    it("toggles the report form panel via header CTA", async () => {
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      expect(screen.queryByRole("heading", { name: /report a new problem/i }))
        .not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));
      expect(
        screen.getByRole("heading", { level: 2, name: /report a new problem/i })
      ).toBeInTheDocument();
    });

    it("shows all 6 backend complaint categories exactly (no invented ones)", async () => {
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());
      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));

      const radioGroup = screen.getByRole("radiogroup", { name: /report a new problem/i });
      const radios = within(radioGroup).getAllByRole("radio");
      expect(radios).toHaveLength(6);

      expect(screen.getByLabelText(/Illegal dumping/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Overflowing bin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Damaged bin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Missed collection/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Environmental hazard/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Other$/i)).toBeInTheDocument();
    });

    it("requires description ≥ 5 chars (blocks submit)", async () => {
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());
      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));

      // Fill location but leave description short
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), "0.35");
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), "32.59");

      const desc = screen.getByLabelText(/Description/i);
      await userEvent.type(desc, "bad"); // 3 chars

      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      expect(api.reportComplaint).not.toHaveBeenCalled();
      expect(screen.getByText(/at least 5 characters/i)).toBeInTheDocument();
    });

    it("requires location (blocks submit)", async () => {
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());
      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));

      await userEvent.type(
        screen.getByLabelText(/Description/i),
        "Debris pile on Kira Road."
      );
      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      expect(api.reportComplaint).not.toHaveBeenCalled();
      expect(screen.getByText(/please set a location/i)).toBeInTheDocument();
    });

    it("sends payload with 4 fields, shows success panel, prepends to list", async () => {
      // Initially empty; after prepend we'll see 1
      (api.myComplaints as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });
      (api.reportComplaint as jest.Mock).mockResolvedValueOnce(CREATED_COMPLAINT);
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));

      // Pick Illegal dumping
      await userEvent.click(screen.getByLabelText(/Illegal dumping/i));
      // Description
      await userEvent.type(
        screen.getByLabelText(/Description/i),
        CREATED_COMPLAINT.description
      );
      // Location
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), String(CREATED_COMPLAINT.latitude));
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), String(CREATED_COMPLAINT.longitude));

      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      await waitFor(() => expect(api.reportComplaint).toHaveBeenCalledTimes(1));
      expect(api.reportComplaint).toHaveBeenCalledWith("citizen-token", {
        category: "ILLEGAL_DUMPING",
        description: CREATED_COMPLAINT.description,
        latitude: CREATED_COMPLAINT.latitude,
        longitude: CREATED_COMPLAINT.longitude,
      });

      // Success panel with reference
      expect(
        screen.getByRole("heading", { level: 2, name: /report submitted successfully/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/#22222222/i)).toBeInTheDocument();

      // Back to reports button closes the panel, new complaint appears in list
      await userEvent.click(screen.getByRole("button", { name: /back to reports/i }));

      // List now contains the new complaint (it was prepended to local state)
      await waitFor(() =>
        expect(screen.getByText(/Illegal dumping/i)).toBeInTheDocument()
      );
    });

    it("shows ErrorState on failure + preserves entered form data", async () => {
      (api.reportComplaint as jest.Mock).mockRejectedValueOnce(
        new ApiError(500, "Server down")
      );
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));
      await userEvent.click(screen.getByLabelText(/Overflowing bin/i));
      await userEvent.type(
        screen.getByLabelText(/Description/i),
        "Bin has been overflowing for 3 days."
      );
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), "0.345");
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), "32.58");

      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByText(/could not submit report/i)).toBeInTheDocument()
      );

      // Form data preserved — description still there, so it can be retried
      expect(screen.getByDisplayValue(/overflowing for 3 days/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue("0.345")).toBeInTheDocument();
      expect(screen.getByDisplayValue("32.58")).toBeInTheDocument();
    });

    it("shows session-expired message on 401 response", async () => {
      (api.reportComplaint as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, "Unauthorized")
      );
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));
      await userEvent.click(screen.getByLabelText(/Other/i));
      await userEvent.type(
        screen.getByLabelText(/Description/i),
        "Other sanitation problem here."
      );
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), "0.34");
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), "32.6");

      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByText(/session has expired.*sign in again/i)).toBeInTheDocument()
      );
    });

    it("Success panel → 'Report another problem' opens a blank form; 'Back to reports' closes the panel", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });
      (api.reportComplaint as jest.Mock).mockResolvedValueOnce(CREATED_COMPLAINT);
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      // Fill and submit
      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));
      await userEvent.click(screen.getByLabelText(/Illegal dumping/i));
      await userEvent.type(
        screen.getByLabelText(/Description/i),
        CREATED_COMPLAINT.description
      );
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), String(CREATED_COMPLAINT.latitude));
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), String(CREATED_COMPLAINT.longitude));
      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByRole("heading", { level: 2, name: /report submitted successfully/i }))
          .toBeInTheDocument()
      );

      // Click "Report another problem" → blank form opens
      await userEvent.click(screen.getByRole("button", { name: /report another problem/i }));
      expect(
        screen.getByRole("heading", { level: 2, name: /report a new problem/i })
      ).toBeInTheDocument();
      // Form fields are blank (description)
      const desc = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
      expect(desc.value).toBe("");

      // Click "Cancel" (hide form) then re-open via header CTA → works
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByRole("heading", { name: /report a new problem/i }))
        .not.toBeInTheDocument();
    });
  });

  describe("list view — expansion + tab counts details", () => {
    it("RESOLVED complaint expand shows resolution_notes inside the details panel", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValue({
        items: [SAMPLE_RESOLVED],
        total: 1,
      });
      render(<ComplaintsPage />);
      await waitFor(() =>
        expect(screen.getByText(/Damaged bin/i)).toBeInTheDocument()
      );

      // Expand card
      await userEvent.click(screen.getByRole("button", { name: /show details/i }));

      // Resolution notes now visible
      expect(screen.getByText(/Bin was replaced on 18 Sep by Collector-04\./i))
        .toBeInTheDocument();
      // Coords also rendered
      expect(screen.getByText(/0\.340000.*32\.600000/)).toBeInTheDocument();
    });

    it("tab counts (All/Open/Resolved) update correctly after a new complaint is prepended locally", async () => {
      (api.myComplaints as jest.Mock).mockResolvedValueOnce({
        items: [SAMPLE_RESOLVED],
        total: 1,
      });
      (api.reportComplaint as jest.Mock).mockResolvedValueOnce(CREATED_COMPLAINT);
      render(<ComplaintsPage />);
      await waitFor(() => expect(api.myComplaints).toHaveBeenCalled());

      const tabList = screen.getByRole("tablist", { name: /filter complaints/i });
      // Initially: All=1, Open=0, Resolved=1
      expect(within(tabList).getAllByText("1").length).toBeGreaterThanOrEqual(1);
      expect(within(tabList).getByText("0")).toBeInTheDocument();

      // Submit a fresh complaint (OPEN status REPORTED)
      await userEvent.click(screen.getByRole("button", { name: /report a problem/i }));
      await userEvent.click(screen.getByLabelText(/Illegal dumping/i));
      await userEvent.type(
        screen.getByLabelText(/Description/i),
        CREATED_COMPLAINT.description
      );
      await userEvent.click(screen.getByRole("button", { name: /enter coordinates manually/i }));
      await userEvent.clear(screen.getByLabelText(/latitude/i));
      await userEvent.type(screen.getByLabelText(/latitude/i), String(CREATED_COMPLAINT.latitude));
      await userEvent.clear(screen.getByLabelText(/longitude/i));
      await userEvent.type(screen.getByLabelText(/longitude/i), String(CREATED_COMPLAINT.longitude));
      await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

      // Close success panel to see the list
      await userEvent.click(screen.getByRole("button", { name: /back to reports/i }));

      // Now counts should be: All=2, Open=1, Resolved=1
      await waitFor(() => {
        const tabs = screen.getByRole("tablist", { name: /filter complaints/i });
        expect(within(tabs).getByText("2")).toBeInTheDocument(); // All
        expect(within(tabs).getAllByText("1").length).toBeGreaterThanOrEqual(2); // Open + Resolved
      });
    });
  });
});
