"use client";

/**
 * Citizen pickup request — Phase 4 guided multi-step redesign.
 *
 * Flow:
 *   1. Waste details    — category (required) + notes (optional)
 *   2. Location         — via LocationPicker (geolocation or manual lat/lng)
 *                         required lat/lng + optional address text
 *   3. Schedule         — preferred_date (date) + preferred_time_window
 *                         (free text like "9:00 AM – 11:00 AM")
 *   4. Review & Submit  — summary card + back button + Submit
 *   5. Confirmation     — after success: reference ID, status, next steps, CTAs
 *
 * Data is NOT lost on browser Back because the page keeps state in useState.
 * Each step validates only the fields it owns before advancing.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError, type PickupOut } from "@/lib/api";
import { LocationPicker, type LocationValue } from "@/components/LocationPicker";
import { Button, EmptyState, ErrorState, StatusBadge } from "@/components/ui";

const WASTE_CATEGORIES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: "ORGANIC", label: "Organic", hint: "Food, garden, compostable" },
  { value: "PLASTIC", label: "Plastic", hint: "Bottles, packaging, bags" },
  { value: "PAPER", label: "Paper", hint: "Newspaper, cardboard, office" },
  { value: "GLASS", label: "Glass", hint: "Bottles, jars" },
  { value: "METAL", label: "Metal", hint: "Cans, foil, scrap" },
  { value: "ELECTRONIC", label: "Electronic", hint: "Batteries, cables, devices" },
  { value: "HAZARDOUS", label: "Hazardous", hint: "Chemicals, medical, sharps" },
  { value: "MIXED", label: "Mixed", hint: "Multiple types together" },
  { value: "OTHER", label: "Other", hint: "Furniture, construction, etc." },
];

const TIME_WINDOW_SUGGESTIONS = [
  "Morning (7:00 – 10:00)",
  "Midday (10:00 – 13:00)",
  "Afternoon (13:00 – 16:00)",
  "Evening (16:00 – 19:00)",
];

type PickupStep = 1 | 2 | 3 | 4;

interface PickupFormState {
  waste_category: string;
  notes: string;
  location: LocationValue;
  preferred_date: string;
  preferred_time_window: string;
}

const DEFAULT_FORM: PickupFormState = {
  waste_category: "PLASTIC",
  notes: "",
  location: { latitude: null, longitude: null, address: "" },
  preferred_date: "",
  preferred_time_window: "",
};

const STEP_LABELS: Record<PickupStep, string> = {
  1: "Waste details",
  2: "Pickup location",
  3: "Preferred time",
  4: "Review",
};

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function friendlyCategoryLabel(raw: string): string {
  return WASTE_CATEGORIES.find((c) => c.value === raw)?.label ?? raw;
}

function PickupStepper({ active }: { active: PickupStep }): ReactNode {
  const steps: PickupStep[] = [1, 2, 3, 4];
  return (
    <ol
      role="list"
      aria-label="Request pickup progress"
      className="mb-6 grid grid-cols-4 gap-2 sm:gap-4"
    >
      {steps.map((s) => {
        const state =
          s < active
            ? "done"
            : s === active
              ? "active"
              : "pending";
        const bg =
          state === "done"
            ? "bg-eco-900 text-white"
            : state === "active"
              ? "bg-eco-100 text-eco-900 ring-1 ring-eco-700"
              : "bg-stone-100 text-stone-500";
        return (
          <li key={s} className="flex flex-col items-center text-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${bg}`}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "done" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.575a1 1 0 0 1-1.414-.008l-3.5-3.5a1 1 0 0 1 1.414-1.414l2.79 2.79 6.795-6.858a1 1 0 0 1 1.419 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                s
              )}
            </div>
            <span
              className={`mt-1.5 text-[11px] sm:text-xs font-medium ${
                state === "pending" ? "text-stone-400" : "text-stone-700"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
            <span className="sr-only">
              — {state === "done" ? "completed" : state === "active" ? "current step" : "not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function NewPickupPage() {
  const { token } = useAuth();

  const [step, setStep] = useState<PickupStep>(1);
  const [form, setForm] = useState<PickupFormState>(DEFAULT_FORM);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success"; pickup: PickupOut }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Announce step changes via aria-live (handled implicitly by "Step X of 4"
  // visible heading). Also ensure we never scroll to nothingness on small
  // screens — scroll into view when step advances.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step, submitState.kind]);

  const minDate = useMemo(() => todayIso(), []);

  function validateStep(s: PickupStep): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.waste_category) {
        e.waste_category = "Please select a waste type.";
      }
    } else if (s === 2) {
      if (form.location.latitude === null || form.location.longitude === null) {
        e.location = "Please set a pickup location.";
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
    } else if (s === 3) {
      if (form.preferred_date) {
        const d = new Date(form.preferred_date + "T00:00:00");
        if (Number.isNaN(d.getTime())) {
          e.preferred_date = "Please enter a valid date.";
        }
      }
      if (form.preferred_time_window.length > 64) {
        e.preferred_time_window = "Time window is too long (max 64 characters).";
      }
    }
    return e;
  }

  function nextStep() {
    const errs = validateStep(step);
    setStepErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStep((s) => (s < 4 ? ((s + 1) as PickupStep) : s));
  }

  function prevStep() {
    setStep((s) => (s > 1 ? ((s - 1) as PickupStep) : s));
    setStepErrors({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const errs = validateStep(3); // validate step 3 (latest input step) before submit
    setStepErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Jump back to the offending step for convenience.
      if (step === 4) setStep(2);
      return;
    }
    setSubmitState({ kind: "submitting" });
    try {
      const created = await api.requestPickup(token, {
        waste_category: form.waste_category,
        latitude: form.location.latitude!,
        longitude: form.location.longitude!,
        address_text: form.location.address?.trim() || undefined,
        preferred_date: form.preferred_date || undefined,
        preferred_time_window: form.preferred_time_window.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSubmitState({ kind: "success", pickup: created });
    } catch (err) {
      let msg = "We couldn't submit your pickup request right now. Please try again in a moment.";
      if (err instanceof ApiError) {
        if (err.status === 401) {
          msg = "Your session has expired. Please sign in again.";
        } else if (err.status === 403) {
          msg = "Your account is not allowed to request pickups.";
        } else if (err.status === 422) {
          msg =
            "Some of the information you entered wasn't accepted. Please double-check the location and try again.";
        } else if (err.status >= 500) {
          msg = "Our server encountered an error. Your data is saved here — please retry in a moment.";
        } else if (err.message) {
          try {
            const parsed = JSON.parse(err.message);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const first = parsed[0];
              const loc = Array.isArray(first.loc) ? first.loc.join(".") : "field";
              msg = `There was a problem with ${loc}: ${first.msg ?? "invalid value"}`;
            }
          } catch {
            /* fall back to generic */
          }
        }
      }
      setSubmitState({ kind: "error", message: msg });
    }
  }

  // ── Success confirmation ─────────────────────────────────────────────────
  if (submitState.kind === "success") {
    const p = submitState.pickup;
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <PickupStepper active={4} />
          <div className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="text-center text-xl sm:text-2xl font-bold text-eco-900">
              Pickup requested successfully
            </h1>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-stone-600">
              Your request has been received and will be reviewed by our operations team.
              You'll get a notification once it's assigned to a collector.
            </p>

            <dl className="mx-auto mt-6 max-w-md divide-y divide-stone-200 rounded-lg border border-stone-200 bg-stone-50">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-sm font-medium text-stone-500">Reference</dt>
                <dd className="text-sm font-mono text-stone-800 break-all text-right">
                  {p.id}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-sm font-medium text-stone-500">Status</dt>
                <dd>
                  <StatusBadge status={p.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-sm font-medium text-stone-500">Waste type</dt>
                <dd className="text-sm font-semibold text-stone-800">
                  {friendlyCategoryLabel(p.waste_category)}
                </dd>
              </div>
              {(p.preferred_date || p.preferred_time_window) && (
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="text-sm font-medium text-stone-500">Preferred pickup</dt>
                  <dd className="text-sm text-right text-stone-800">
                    {p.preferred_date && formatDate(p.preferred_date)}
                    {p.preferred_date && p.preferred_time_window && <br />}
                    {p.preferred_time_window}
                  </dd>
                </div>
              )}
              {p.address_text && (
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="text-sm font-medium text-stone-500">Address</dt>
                  <dd className="text-sm text-right text-stone-800 break-words">
                    {p.address_text}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row">
              <Button href="/dashboard" variant="primary" size="lg" className="flex-1">
                Return to dashboard
              </Button>
              <Button href="/schedules" variant="secondary" size="lg" className="flex-1">
                View schedules
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-eco-900">Request a pickup</h1>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            Step {step} of 4 — <span className="text-eco-800">{STEP_LABELS[step]}</span>
          </span>
        </div>
        <PickupStepper active={step} />

        <form
          onSubmit={onSubmit}
          className="space-y-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8"
          noValidate
        >
          {step === 1 && (
            <section aria-labelledby="waste-details-heading">
              <h2
                id="waste-details-heading"
                className="text-base font-semibold text-eco-900"
              >
                Waste details
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Tell us what kind of waste needs to be collected.
              </p>

              <div className="mt-4">
                <label className="block text-sm font-medium text-stone-700">
                  Waste type
                  <span className="ml-1 text-red-600" aria-hidden="true">
                    *
                  </span>
                  <span className="sr-only"> (required)</span>
                </label>
                <div
                  role="radiogroup"
                  aria-labelledby="waste-details-heading"
                  aria-invalid={!!stepErrors.waste_category || undefined}
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"
                >
                  {WASTE_CATEGORIES.map((cat) => {
                    const checked = form.waste_category === cat.value;
                    return (
                      <label
                        key={cat.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors min-h-[64px] ${
                          checked
                            ? "border-eco-700 bg-eco-50 ring-1 ring-eco-700"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="waste_category"
                          value={cat.value}
                          checked={checked}
                          onChange={() => {
                            setForm((f) => ({ ...f, waste_category: cat.value }));
                            setStepErrors((s) => ({ ...s, waste_category: "" }));
                          }}
                          className="mt-1 h-4 w-4 shrink-0 accent-eco-900"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-stone-800">
                            {cat.label}
                          </span>
                          <span className="block text-xs text-stone-500">{cat.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {stepErrors.waste_category && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {stepErrors.waste_category}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <label
                  htmlFor="pickup-notes"
                  className="block text-sm font-medium text-stone-700"
                >
                  Notes
                  <span className="ml-1 text-stone-400 text-xs">(optional)</span>
                </label>
                <textarea
                  id="pickup-notes"
                  rows={3}
                  maxLength={2000}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value.slice(0, 2000) }))
                  }
                  placeholder="Any special handling, access gates, gate codes, etc."
                  className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
                />
                <p className="mt-1 text-xs text-stone-400">
                  {form.notes.length}/2000
                </p>
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="location-heading">
              <h2 id="location-heading" className="text-base font-semibold text-eco-900">
                Pickup location
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Where should the collector go? Latitude and longitude are required so the
                location can be mapped. An address helps them find you on the ground.
              </p>

              <div className="mt-4">
                <LocationPicker
                  value={form.location}
                  onChange={(loc) => {
                    setForm((f) => ({ ...f, location: loc }));
                    setStepErrors((s) => ({ ...s, location: "" }));
                  }}
                  error={stepErrors.location ?? null}
                  label=""
                  description=""
                />
              </div>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="schedule-heading">
              <h2 id="schedule-heading" className="text-base font-semibold text-eco-900">
                Preferred time
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Optional — tell us when you'd like the pickup to happen. We'll do our best
                to accommodate it, but an exact time is not guaranteed.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="preferred-date"
                    className="block text-sm font-medium text-stone-700"
                  >
                    Preferred date
                    <span className="ml-1 text-stone-400 text-xs">(optional)</span>
                  </label>
                  <input
                    id="preferred-date"
                    type="date"
                    min={minDate}
                    value={form.preferred_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, preferred_date: e.target.value }));
                      setStepErrors((s) => ({ ...s, preferred_date: "" }));
                    }}
                    className="mt-1 w-full min-h-[44px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
                  />
                  {stepErrors.preferred_date && (
                    <p role="alert" className="mt-1 text-sm text-red-600">
                      {stepErrors.preferred_date}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="preferred-time"
                    className="block text-sm font-medium text-stone-700"
                  >
                    Time window
                    <span className="ml-1 text-stone-400 text-xs">(optional)</span>
                  </label>
                  <input
                    id="preferred-time"
                    type="text"
                    maxLength={64}
                    list="time-suggestions"
                    value={form.preferred_time_window}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        preferred_time_window: e.target.value.slice(0, 64),
                      }));
                      setStepErrors((s) => ({ ...s, preferred_time_window: "" }));
                    }}
                    placeholder="e.g. Morning (7:00 – 10:00)"
                    className="mt-1 w-full min-h-[44px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-eco-700 focus:outline-none focus:ring-1 focus:ring-eco-700"
                  />
                  <datalist id="time-suggestions">
                    {TIME_WINDOW_SUGGESTIONS.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-stone-400">
                    {form.preferred_time_window.length}/64
                  </p>
                  {stepErrors.preferred_time_window && (
                    <p role="alert" className="mt-1 text-sm text-red-600">
                      {stepErrors.preferred_time_window}
                    </p>
                  )}
                </div>

                <EmptyState
                  description="If left blank, the pickup will be scheduled for the earliest available slot in your zone."
                  className="text-left"
                />
              </div>
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="review-heading">
              <h2 id="review-heading" className="text-base font-semibold text-eco-900">
                Review your request
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Please double-check everything before submitting. You can go back to make
                changes.
              </p>

              <dl className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-stone-50 text-sm">
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="font-medium text-stone-500">Waste type</dt>
                  <dd className="font-semibold text-stone-800 text-right">
                    {friendlyCategoryLabel(form.waste_category)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="font-medium text-stone-500">Coordinates</dt>
                  <dd className="text-stone-800 text-right font-mono text-xs">
                    {form.location.latitude!.toFixed(6)},{" "}
                    {form.location.longitude!.toFixed(6)}
                  </dd>
                </div>
                {form.location.address && form.location.address.trim() !== "" && (
                  <div className="flex items-start justify-between gap-4 px-4 py-3">
                    <dt className="font-medium text-stone-500">Address</dt>
                    <dd className="text-stone-800 text-right break-words max-w-[60%]">
                      {form.location.address.trim()}
                    </dd>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="font-medium text-stone-500">Preferred date</dt>
                  <dd className="text-stone-800 text-right">
                    {form.preferred_date
                      ? formatDate(form.preferred_date)
                      : <span className="text-stone-400">Any date</span>}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="font-medium text-stone-500">Time window</dt>
                  <dd className="text-stone-800 text-right">
                    {form.preferred_time_window.trim() || (
                      <span className="text-stone-400">Any time</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="font-medium text-stone-500">Notes</dt>
                  <dd className="text-stone-800 text-right break-words max-w-[60%]">
                    {form.notes.trim() || (
                      <span className="text-stone-400">None</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {submitState.kind === "error" && (
            <ErrorState
              title="Could not submit request"
              message={submitState.message}
              onRetry={() => setSubmitState({ kind: "idle" })}
            />
          )}

          <div
            className={`flex gap-3 pt-2 ${
              step === 1 ? "justify-end" : "justify-between"
            }`}
          >
            {step > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={prevStep}
                size="lg"
                className="px-3"
                disabled={submitState.kind === "submitting"}
              >
                Back
              </Button>
            )}
            {step < 4 ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={nextStep}
                disabled={submitState.kind === "submitting"}
                className="ml-auto"
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitState.kind === "submitting"}
                disabled={submitState.kind === "submitting"}
                className="ml-auto"
              >
                {submitState.kind === "submitting" ? "Submitting request…" : "Request pickup"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
