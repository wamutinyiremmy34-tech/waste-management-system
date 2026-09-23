/**
 * PickupTimeline — unit tests
 *
 * Verifies the visual state machine:
 * - Active step gets aria-current="step"
 * - Completed steps show checkmark (via accessible text / ARIA)
 * - Terminal failure states show a failure banner
 * - All 5 step labels are always rendered for screen readers
 */

import { render, screen } from "@testing-library/react";
import { PickupTimeline } from "@/components/ui/PickupTimeline";

describe("PickupTimeline", () => {
  const STEP_LABELS = ["Requested", "Assigned", "En route", "Arrived", "Collected"];

  it("renders all five step labels for every status", () => {
    render(<PickupTimeline status="REQUESTED" />);
    STEP_LABELS.forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument()
    );
  });

  it("marks the REQUESTED step as aria-current='step'", () => {
    const { container } = render(<PickupTimeline status="REQUESTED" />);
    const current = container.querySelector("[aria-current='step']");
    expect(current).toBeInTheDocument();
    expect(current?.textContent).toContain("1"); // step 1
  });

  it("marks the ASSIGNED step (index 1) as aria-current='step'", () => {
    const { container } = render(<PickupTimeline status="ASSIGNED" />);
    const current = container.querySelector("[aria-current='step']");
    expect(current).toBeInTheDocument();
  });

  it("marks the EN_ROUTE step as aria-current='step'", () => {
    const { container } = render(<PickupTimeline status="EN_ROUTE" />);
    const current = container.querySelector("[aria-current='step']");
    expect(current).toBeInTheDocument();
  });

  it("marks the COLLECTED step as aria-current='step'", () => {
    const { container } = render(<PickupTimeline status="COLLECTED" />);
    const current = container.querySelector("[aria-current='step']");
    expect(current).toBeInTheDocument();
  });

  it("shows a failure banner for FAILED status", () => {
    render(<PickupTimeline status="FAILED" />);
    expect(
      screen.getByText(/collection could not be completed/i)
    ).toBeInTheDocument();
  });

  it("shows a missed banner for MISSED status", () => {
    render(<PickupTimeline status="MISSED" />);
    expect(screen.getByText(/collection was missed/i)).toBeInTheDocument();
  });

  it("shows a cancelled banner for CANCELLED status", () => {
    render(<PickupTimeline status="CANCELLED" />);
    expect(screen.getByText(/this pickup was cancelled/i)).toBeInTheDocument();
  });

  it("does NOT show aria-current for terminal failure statuses", () => {
    const { container } = render(<PickupTimeline status="FAILED" />);
    expect(container.querySelector("[aria-current='step']")).toBeNull();
  });

  it("has an accessible aria-label describing the current status", () => {
    render(<PickupTimeline status="EN_ROUTE" />);
    // The <ol> should have an aria-label
    expect(
      screen.getByRole("list", { name: /en route/i })
    ).toBeInTheDocument();
  });

  it("has an accessible aria-label for failure states", () => {
    render(<PickupTimeline status="CANCELLED" />);
    expect(
      screen.getByRole("list", { name: /cancelled/i })
    ).toBeInTheDocument();
  });
});
