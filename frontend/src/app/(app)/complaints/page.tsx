"use client";

/**
 * Citizen complaints page — Phase 4.
 *
 * Layout (mobile-first):
 *   - Hero heading + "Report a problem" CTA (toggles the form panel)
 *   - List of citizen's own complaints as cards (NOT a table). Each card shows:
 *       · Complaint ID (short, monospace) + created date
 *       · StatusBadge (complaint variant)
 *       · Category label
 *       · Short description preview
 *       · Expandable details (resolution_notes if any)
 *   - EmptyState if 0 complaints + CTA to report one
 *   - Collapsible report-a-problem form:
 *       · Complaint category (radio buttons, exact backend enums)
 *       · Description (textarea, 5–2000 chars)
 *       · LocationPicker (lat/lng required; hideAddress since backend doesn't store address)
 *       · Submit button with loading/error/success states
 *
 * Backend contract (verified via actual source):
 *   POST /complaints:
 *     category: ComplaintCategory (6 values from enums.py)
 *     description: string 5..2000
 *     latitude: float -90..90  REQUIRED
 *     longitude: float -180..180  REQUIRED
 *   Response: ComplaintOut (id, category, description, status=REPORTED, lat/lng,
 *                            resolution_notes=null, created_at)
 *   GET /complaints/mine:
 *     { items: ComplaintOut[], total, page, page_size }
 *
 * Known backend limitations (respected, NOT faked):
 *   - No related_pickup_id field on Complaint model → no pickup picker.
 *   - No file/evidence upload endpoint → no upload UI.
 *   - No citizen-facing complaint updates beyond what GET /mine returns.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError, type ComplaintOut } from "@/lib/api";
import { LocationPicker, type LocationValue } from "@/components/LocationPicker";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "@/components/ui";

const COMPLAINT_CATEGORIES: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
}> = [
  {
    value: "ILLEGAL_DUMPING",
    label: "Illegal dumping",
    hint: "Waste dumped in unauthorised places (roadsides, open land, etc.)",
  },
  {
    value: "OVERFLOWING_BIN",
    label: "Overflowing bin",
    hint: "A public bin is full or spilling onto the street",
  },
  {
    value: "DAMAGED_BIN",
    label: "Damaged bin",
    hint: "Broken lids, cracks, missing wheels, vandalism",
  },
  {
    value: "MISSED_COLLECTION",
    label: "Missed collection",
    hint: "Your scheduled pickup was not completed",
  },
  {
    value: "ENVIRONMENTAL_HAZARD",
    label: "Environmental hazard",
    hint: "Chemical spills, medical waste, hazardous materials",
  },
  {
    value: "OTHER",
    label: "Other",
    hint: "Any other waste or sanitation problem",
  },
];

type TabFilter = "all" | "open" | "resolved";

const TAB_FILTERS: ReadonlyArray<{ value: TabFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

const OPEN_STATUSES = new Set([
  "REPORTED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
]);

interface ComplaintFormState {
  category: string;
  description: string;
  location: LocationValue;
}

const EMPTY_FORM: ComplaintFormState = {
  category: "OTHER",
  description: "",
  location: { latitude: null, longitude: null },
};

function formatCategoryLabel(raw: string): string {
  return (
    COMPLAINT_CATEGORIES.find((c) => c.value === raw)?.label ??
    raw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  );
}

function formatShortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ComplaintsPage() {
  const { token } = useAuth();

  const [filter, setFilter] = useState<TabFilter>("all");
  const [items, setItems] = useState<ComplaintOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ComplaintFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success"; complaint: ComplaintOut }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const loadComplaints = useCallback(async () => {
    if (!token) return;
    setLoadState({ kind: "loading" });
    try {
      const res = await api.myComplaints(token);
      setItems(res.items ?? []);
      setTotal(res.total ?? res.items?.length ?? 0);
      setLoadState({ kind: "idle" });
    } catch (err) {
      let msg = "Could not load your reports right now.";
      if (err instanceof ApiError) {
        if (err.status === 401) msg = "Your session has expired. Please sign in again.";
        else if (err.status >= 500)
          msg = "Our server is having trouble. Please try again in a moment.";
      }
      setLoadState({ kind: "error", message: msg });
    }
  }, [token]);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  function validateForm(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!COMPLAINT_CATEGORIES.some((c) => c.value === form.category)) {
      e.category = "Please select a problem type.";
    }
    const d = form.description.trim();
    if (d.length < 5) {
      e.description = "Please provide at least 5 characters of detail.";
    } else if (d.length > 2000) {
      e.description = "Description is too long (max 2000 characters).";
    }
    if (form.location.latitude === null || form.location.longitude === null) {
      e.location = "Please set a location for this report.";
    } else if (
      !Number.isFinite(form.location.latitude) ||
      !Number.isFinite(form.location.longitude) ||
      form.location.latitude < -90 ||
      form.location.latitude > 90 ||
      form.location.longitude < -180 ||
      form.location.longitude > 180
    ) {
      e.location = "The location coordinates are out of range.";
    }
    return e;
  }

  async function onSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const errs = validateForm();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitState({ kind: "submitting" });
    try {
      const created = await api.reportComplaint(token, {
        category: form.category,
        description: form.description.trim(),
        latitude: form.location.latitude!,
        longitude: form.location.longitude!,
      });
      setSubmitState({ kind: "success", complaint: created });
      setItems((prev) => [created, ...prev]);
      setTotal((t) => t + 1);
      setForm(EMPTY_FORM);
      setFormErrors({});
    } catch (err) {
      let msg =
        "We couldn't submit your report right now. Your information is saved here — please try again.";
      if (err instanceof ApiError) {
        if (err.status === 401) {
          msg = "Your session has expired. Please sign in again.";
        } else if (err.status === 403) {
          msg = "Your account is not allowed to file reports.";
        } else if (err.status === 422) {
          msg =
            "Some of the information you entered wasn't accepted. Double-check the description length and coordinates, then try again.";
        } else if (err.status >= 500) {
          msg = "Our server hit an error. Your information is preserved — please retry.";
        }
      }
      setSubmitState({ kind: "error", message: msg });
    }
  }

  const visibleItems = items.filter((c) => {
    if (filter === "all") return true;
    if (filter === "open") return OPEN_STATUSES.has(c.status);
    return c.status === "RESOLVED" || c.status === "REJECTED";
  });

  const counts = {
    all: items.length,
    open: items.filter((c) => OPEN_STATUSES.has(c.status)).length,
    resolved: items.filter((c) => c.status === "RESOLVED" || c.status === "REJECTED").length,
  };

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-eco-900">
                My reports
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                Report sanitation problems and track how they're resolved.
                {total > 0 && (
                  <>
                    {" "}You have <strong className="text-stone-700">{total}</strong> report{total === 1 ? "" : "s"} on file.
                  </>
                )}
              </p>
            </div>
            {submitState.kind !== "success" && (
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => {
                  setShowForm((v) => !v);
                  if (submitState.kind === "error") setSubmitState({ kind: "idle" });
                }}
              >
                {showForm ? "Hide report form" : "Report a problem"}
              </Button>
            )}
          </div>
        </header>

        {/* ── Report form panel ─────────────────────────────────────────── */}
        {(showForm || submitState.kind === "success") && (
          <section
            aria-labelledby="report-heading"
            className="mb-8 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"
          >
            {submitState.kind === "success" ? (
              <ComplaintSuccessPanel
                complaint={submitState.complaint}
                onFileAnother={() => {
                  setSubmitState({ kind: "idle" });
                  setShowForm(true);
                }}
                onDone={() => {
                  setSubmitState({ kind: "idle" });
                  setShowForm(false);
                }}
              />
            ) : (
              <>
                <h2
                  id="report-heading"
                  className="text-base sm:text-lg font-semibold text-eco-900"
                >
                  Report a new problem
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Give us accurate details and an approximate location so we can
                  respond quickly. Reports are public safety records.
                </p>

                <form
                  onSubmit={onSubmitReport}
                  className="mt-5 space-y-5"
                  noValidate
                >
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-stone-700">
                      Problem type
                      <span className="ml-1 text-red-600" aria-hidden="true">
                        *
                      </span>
                      <span className="sr-only"> (required)</span>
                    </label>
                    <div
                      role="radiogroup"
                      aria-labelledby="report-heading"
                      aria-invalid={!!formErrors.category || undefined}
                      className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"
                    >
                      {COMPLAINT_CATEGORIES.map((cat) => {
                        const checked = form.category === cat.value;
                        return (
                          <label
                            key={cat.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left min-h-[68px] transition-colors ${
                              checked
                                ? "border-eco-700 bg-eco-50 ring-1 ring-eco-700"
                                : "border-stone-200 bg-white hover:bg-stone-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="complaint_category"
                              value={cat.value}
                              checked={checked}
                              onChange={() => {
                                setForm((f) => ({ ...f, category: cat.value }));
                                setFormErrors((e) => ({ ...e, category: "" }));
                              }}
                              className="mt-1 h-4 w-4 shrink-0 accent-eco-900"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-stone-800">
                                {cat.label}
                              </span>
                              <span className="block text-xs text-stone-500">
                                {cat.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {formErrors.category && (
                      <p role="alert" className="mt-2 text-sm text-red-600">
                        {formErrors.category}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      htmlFor="complaint-desc"
                      className="block text-sm font-medium text-stone-700"
                    >
                      Description
                      <span className="ml-1 text-red-600" aria-hidden="true">
                        *
                      </span>
                      <span className="sr-only"> (required)</span>
                    </label>
                    <textarea
                      id="complaint-desc"
                      rows={5}
                      minLength={5}
                      maxLength={2000}
                      value={form.description}
                      onChange={(e) => {
                        setForm((f) => ({
                          ...f,
                          description: e.target.value.slice(0, 2000),
                        }));
                        setFormErrors((e) => ({ ...e, description: "" }));
                      }}
                      placeholder="Describe what you saw, where exactly, and when. Include landmark details, nearby bins, vehicle descriptions, or safety notes if relevant."
                      aria-invalid={!!formErrors.description || undefined}
                      className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
                    />
                    <div className="mt-1 flex items-center justify-between text-xs text-stone-400">
                      <span>5 to 2000 characters</span>
                      <span>{form.description.length}/2000</span>
                    </div>
                    {formErrors.description && (
                      <p role="alert" className="mt-1 text-sm text-red-600">
                        {formErrors.description}
                      </p>
                    )}
                  </div>

                  {/* Location */}
                  <LocationPicker
                    value={form.location}
                    onChange={(loc) => {
                      setForm((f) => ({ ...f, location: loc }));
                      setFormErrors((e) => ({ ...e, location: "" }));
                    }}
                    error={formErrors.location ?? null}
                    label="Where did this happen?"
                    description="Pin the location on a map via your device, or enter coordinates manually. This is required."
                    hideAddress
                  />

                  {submitState.kind === "error" && (
                    <ErrorState
                      title="Could not submit report"
                      message={submitState.message}
                      onRetry={() => setSubmitState({ kind: "idle" })}
                    />
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowForm(false);
                        setFormErrors({});
                        setSubmitState({ kind: "idle" });
                      }}
                      disabled={submitState.kind === "submitting"}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={submitState.kind === "submitting"}
                      disabled={submitState.kind === "submitting"}
                    >
                      {submitState.kind === "submitting"
                        ? "Submitting report…"
                        : "Submit report"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </section>
        )}

        {/* ── Tabs + list ──────────────────────────────────────────────── */}
        <section aria-labelledby="list-heading">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="list-heading" className="text-base font-semibold text-stone-800">
              Report history
            </h2>
            <div
              role="tablist"
              aria-label="Filter complaints"
              className="flex flex-wrap gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1 self-start"
            >
              {TAB_FILTERS.map((t) => {
                const active = filter === t.value;
                const count = counts[t.value];
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(t.value)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors min-h-[36px] ${
                      active
                        ? "bg-white text-eco-900 shadow-sm ring-1 ring-stone-200"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    {t.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? "bg-eco-100 text-eco-800" : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {loadState.kind === "loading" && items.length === 0 && (
            <LoadingState variant="spinner" message="Loading your reports…" />
          )}

          {loadState.kind === "error" && (
            <ErrorState
              variant="inline"
              title="Couldn't load reports"
              message={loadState.message}
              onRetry={() => void loadComplaints()}
            />
          )}

          {loadState.kind === "idle" && visibleItems.length === 0 && (
            <EmptyState
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.194 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                  <path d="M12 7.5v3m0 3h.008v.008H12V10.5z" />
                </svg>
              }
              title={
                filter === "all"
                  ? "No reports yet"
                  : filter === "open"
                    ? "No open reports"
                    : "No resolved reports"
              }
              description={
                filter === "all"
                  ? "Report issues like illegal dumping, missed collections, or damaged bins to help keep your area clean."
                  : filter === "open"
                    ? "All your open reports are resolved. Great job following up!"
                    : "You don't have any resolved or rejected reports yet."
              }
              action={
                filter === "all"
                  ? { label: "Report a problem", onClick: () => setShowForm(true) }
                  : undefined
              }
            />
          )}

          {loadState.kind !== "loading" && visibleItems.length > 0 && (
            <ul className="space-y-3">
              {visibleItems.map((c) => (
                <ComplaintCard key={c.id} complaint={c} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ComplaintCard({ complaint }: { complaint: ComplaintOut }) {
  const [open, setOpen] = useState(false);
  const isResolvedTerm = complaint.status === "RESOLVED" || complaint.status === "REJECTED";

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono text-xs text-stone-500"
              title={`Full ID: ${complaint.id}`}
            >
              #{formatShortId(complaint.id)}
            </span>
            <StatusBadge status={complaint.status} />
          </div>
          <p className="mt-2 text-sm font-semibold text-stone-800">
            {formatCategoryLabel(complaint.category)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-stone-600">
            {complaint.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-stone-400">Reported</p>
          <p className="text-xs font-medium text-stone-600">
            {formatDateTime(complaint.created_at)}
          </p>
        </div>
      </div>

      {(complaint.resolution_notes || !isResolvedTerm) && (
        <div className="mt-3 border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between text-xs font-semibold text-eco-800 hover:text-eco-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eco-700 focus-visible:ring-offset-2 rounded px-1 py-1"
          >
            <span>{open ? "Hide details" : "Show details"}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {open && (
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-stone-400">Description</dt>
                <dd className="flex-1 whitespace-pre-wrap text-stone-700 text-sm">
                  {complaint.description}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-stone-400">Location</dt>
                <dd className="flex-1 font-mono text-[11px] text-stone-600">
                  Lat {complaint.latitude.toFixed(6)}, Lng{" "}
                  {complaint.longitude.toFixed(6)}
                </dd>
              </div>
              {complaint.resolution_notes && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-stone-400">Resolution</dt>
                  <dd className="flex-1 rounded-md bg-stone-50 p-2 text-stone-700 text-sm">
                    {complaint.resolution_notes}
                  </dd>
                </div>
              )}
              {!complaint.resolution_notes && !isResolvedTerm && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-stone-400">Status note</dt>
                  <dd className="flex-1 rounded-md bg-amber-50 p-2 text-amber-800 text-sm">
                    Your report has been received and will be reviewed by the operations
                    team. You'll get a notification once its status changes.
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

function ComplaintSuccessPanel({
  complaint,
  onFileAnother,
  onDone,
}: {
  complaint: ComplaintOut;
  onFileAnother: () => void;
  onDone: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2 className="text-lg sm:text-xl font-bold text-eco-900">
        Report submitted successfully
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
        Thanks for helping us keep the city clean. Your report has been logged and the
        operations team has been notified. You'll receive notifications as it progresses.
      </p>

      <dl className="mx-auto mt-5 max-w-md divide-y divide-stone-200 rounded-lg border border-stone-200 bg-stone-50 text-left">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-stone-500">Reference</dt>
          <dd className="font-mono text-sm text-stone-800 break-all text-right">
            #{formatShortId(complaint.id)}
            <span className="sr-only">Full ID: {complaint.id}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-stone-500">Current status</dt>
          <dd>
            <StatusBadge status={complaint.status} />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-stone-500">Problem type</dt>
          <dd className="text-sm font-semibold text-right text-stone-800">
            {formatCategoryLabel(complaint.category)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm font-medium text-stone-500">Reported</dt>
          <dd className="text-sm text-right text-stone-800">
            {formatDateTime(complaint.created_at)}
          </dd>
        </div>
      </dl>

      <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="lg" className="flex-1" onClick={onDone}>
          Back to reports
        </Button>
        <Button variant="secondary" size="lg" className="flex-1" onClick={onFileAnother}>
          Report another problem
        </Button>
      </div>
    </div>
  );
}
