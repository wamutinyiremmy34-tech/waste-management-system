# Environmental Impact — Assumptions

`GET /api/v1/recycling/impact-summary` and `app/intelligence/environmental_calculator.py` compute:

- **Real, unestimated figures** directly from recorded data: total waste collected (kg), total
  waste recycled (kg), diversion rate (%). These are exact sums/ratios over `WasteRecord` and
  `RecyclingRecord` — no assumptions involved.
- **One estimated figure**: `estimated_co2e_avoided_kg`, computed by multiplying recycled quantity
  per category by a configurable "kg CO2e avoided per kg recycled" factor
  (`CO2E_AVOIDED_PER_KG_RECYCLED` in `environmental_calculator.py`). These factors are illustrative
  placeholders based on commonly-cited general ranges, **not** a verified life-cycle assessment for
  Uganda's specific waste stream, and every response that includes this figure marks it
  `is_estimate: True`.

## Why this matters

The spec explicitly warns against claiming "scientifically exact CO2 values" (section 23). Every
place this number surfaces is labeled as an estimate built on stated, editable assumptions — never
presented as a precise measurement. To make these figures more rigorous later, replace the values in
`CO2E_AVOIDED_PER_KG_RECYCLED` with region-specific, cited coefficients and keep the `is_estimate`
flag.

## A real caveat discovered through actual testing, not assumed

`diversion_rate_percent` can legitimately exceed 100%. This isn't a bug — `RecyclingRecord` is
intentionally decoupled from `WasteRecord`/pickups (see `docs/database.md`), so a recycler can log
material received from sources outside EcoTrack's own tracked pickups (e.g. dropped off directly by
someone who never used the app). When recorded recycling volume exceeds recorded pickup volume, the
ratio goes over 100%. Observed directly while testing the recycler UI against seed data: 120kg
recorded as recycled against only 25.7kg recorded as collected via pickups, giving 466.93%. This is
mathematically correct given the inputs, but confusing to read at face value — a future refinement
should either clearly relabel it (e.g. "recycled volume relative to EcoTrack-tracked collections,
may exceed 100% for recyclers with non-EcoTrack sources") or split it into two metrics: platform-
sourced diversion rate vs. total recycler throughput. Flagged here rather than silently displayed
without explanation.
