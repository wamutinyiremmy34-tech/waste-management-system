# Operational Metrics Reference

Every KPI and metric in EcoTrack's operational intelligence layer is documented here.
No metric is invented or estimated without documentation.

---

## 1. Collection Performance KPIs

### Completion Rate

| Field | Value |
|---|---|
| **Metric** | `completion_rate_percent` |
| **Definition** | Fraction of terminal-status pickups that were successfully collected |
| **Formula** | `COLLECTED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100` |
| **Data source** | `pickup_requests` table, `status` column |
| **Time window** | Configurable `date_from` / `date_to`; defaults to all-time |
| **Limitation** | In-progress pickups (REQUESTED, ASSIGNED, EN_ROUTE, ARRIVED) are excluded. A low rate may reflect a large active backlog not yet completed rather than genuine failures. |

### Failure Rate

| Field | Value |
|---|---|
| **Formula** | `FAILED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100` |
| **Data source** | `pickup_requests.status` |
| **Limitation** | Does not distinguish between collector-caused failures and access failures (road blocked, customer not home). Failure reason is captured in `collections.failure_reason` but not aggregated here. |

### Miss Rate

| Field | Value |
|---|---|
| **Formula** | `MISSED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100` |
| **Limitation** | MISSED is currently set by the scheduler or manually by admins. No automatic detection of missed collections exists. |

### Unassigned Backlog

| Field | Value |
|---|---|
| **Definition** | Count of pickup requests currently in REQUESTED status (no collector assigned) |
| **Formula** | `COUNT(pickup_requests WHERE status = 'REQUESTED')` |
| **Threshold** | Backlog > 5 triggers MEDIUM attention item; > 15 triggers HIGH |

### Average Collection Weight

| Field | Value |
|---|---|
| **Formula** | `AVG(collections.quantity_kg WHERE was_successful = TRUE)` |
| **Limitation** | Only includes collections where quantity was entered. Collectors occasionally skip the weight field. |

---

## 2. Overdue Pickup Detection

### Overdue Days

| Field | Value |
|---|---|
| **Definition** | How many days past a pickup's expected date it remains uncollected |
| **Formula (with preferred_date)** | `max(0, today - preferred_date)` |
| **Formula (without preferred_date)** | `max(0, today - created_at.date() - 2)` — 2-day grace period |
| **Applies to** | REQUESTED and ASSIGNED statuses only |
| **Limitation** | `preferred_date` is optional (citizens may not set it). Without it, the 2-day grace period is a policy choice, not a contractual SLA. |

---

## 3. Priority Score (CollectionPrioritizer)

| Field | Value |
|---|---|
| **Algorithm** | `CollectionPrioritizer` — rule-based weighted scoring, NOT machine learning |
| **Formula** | `score = days_overdue × 2.0 + bin_fill_percent × 0.5 + nearby_complaint_count × 5.0` |
| **Weights** | Configurable in `CollectionPrioritizer.__init__` |
| **Labels** | HIGH ≥ 10 · MEDIUM ≥ 4 · LOW < 4 |
| **Current limitation** | `bin_fill_percent` = 0 (bins not linked to pickups in MVP) · `nearby_complaint_count` = 0 (spatial join per-pickup excluded for batch performance) · Score is therefore driven entirely by `days_overdue` in the MVP |
| **Future improvement** | Add `ST_DWithin` complaint count per pickup for a richer score |

---

## 4. Zone Performance

### Per-Zone Metrics

| Metric | Formula | Notes |
|---|---|---|
| `total_pickups` | `COUNT(pickup_requests WHERE assigned_zone_id = zone.id)` | Only pickups explicitly assigned to the zone via the assignment UI |
| `completed` | `COUNT WHERE status = 'COLLECTED'` | — |
| `failed_or_missed` | `COUNT WHERE status IN ('FAILED', 'MISSED')` | Combined for simplicity |
| `active` | `COUNT WHERE status IN ('REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED')` | — |
| `completion_rate_percent` | `completed / (completed + failed_or_missed) × 100` | NULL if no terminal pickups |
| `waste_collected_kg` | `SUM(waste_records.quantity_kg)` joined via Collection → PickupRequest → zone | — |
| `unresolved_complaints` | `COUNT(complaints WHERE ST_Contains(zone.boundary, complaint.location) AND status ≠ 'RESOLVED')` | PostGIS spatial join |
| `attention_needed` | `unresolved_complaints > 3 OR completion_rate < 60% OR active > 10` | Simple rule; adjustable |

**Limitation:** Pickups are linked to zones via `assigned_zone_id` set during assignment. Pickups not yet assigned to a zone do not appear in any zone's metrics. This undercounts the actual workload per zone.

---

## 5. Collector Performance

| Metric | Formula | Notes |
|---|---|---|
| `completions` | `COUNT(collections WHERE was_successful = TRUE AND collector_id = X)` | — |
| `failures` | `COUNT(collections WHERE was_successful = FALSE AND collector_id = X)` | — |
| `total_kg_collected` | `SUM(quantity_kg WHERE was_successful)` | NULL entries excluded |
| `completion_rate_percent` | `completions / (completions + failures) × 100` | NULL if no collections |

**Limitation:** Counts raw collections, not collections per day/week. A collector who worked 3 days appears lower than one who worked 30 days. Date filtering is available.

---

## 6. Collection Trend (Time-Series)

| Metric | Formula | Notes |
|---|---|---|
| `completed` | `COUNT(collections WHERE was_successful = TRUE AND completed_at::date = day)` | — |
| `failed` | `COUNT(collections WHERE was_successful = FALSE AND completed_at::date = day)` | — |
| `total` | `completed + failed` | — |

**Limitation:** Only counts collections with a `completed_at` timestamp (terminal collections). In-progress pickups do not appear in the trend until resolved.

---

## 7. Hotspot Detection

| Field | Value |
|---|---|
| **Algorithm** | PostGIS `ST_ClusterDBSCAN` on `complaints.location` |
| **Type** | Deterministic spatial clustering — NOT machine learning or prediction |
| **Parameters** | `eps_meters` (cluster radius, default 300m) · `min_points` (minimum per cluster, default 3) |
| **Output** | Centroid lat/lng of each cluster + complaint count |
| **Data source** | `complaints` table, ALL statuses (including resolved) |
| **Limitation** | Clusters all historical complaints regardless of date. A resolved historical cluster appears the same as an active current cluster. Future improvement: filter by `status != 'RESOLVED'` or by date range. |

---

## 8. Environmental Impact

| Metric | Formula | Notes |
|---|---|---|
| `total_waste_collected_kg` | `SUM(waste_records.quantity_kg)` | Real data from verified collections |
| `total_waste_recycled_kg` | `SUM(recycling_records.quantity_kg)` | Real data from recycler logs |
| `diversion_rate_percent` | `recycled / collected × 100` | Can exceed 100% if recyclers receive material from outside EcoTrack pickups |
| `estimated_co2e_avoided_kg` | `SUM(recycled_qty × CO2E_AVOIDED_PER_KG[category])` | **Estimate only** — configurable per-category factors in `environmental_calculator.py` |

**CO2e factors used (configurable estimates, not life-cycle measurements):**

| Category | Factor (kg CO2e / kg recycled) |
|---|---|
| PLASTIC | 1.5 |
| PAPER | 0.9 |
| GLASS | 0.3 |
| METAL | 2.0 |
| ORGANIC | 0.25 |
| ELECTRONIC | 1.2 |
| HAZARDOUS | 0.0 |
| MIXED | 0.4 |
| OTHER | 0.2 |

These are illustrative estimates from general waste literature, not verified measurements.

---

## 9. Route Optimization

| Field | Value |
|---|---|
| **Algorithm** | `DeterministicNearestNeighbourOptimizer` — greedy nearest-neighbour using haversine distance |
| **Type** | Deterministic, NOT machine learning or GPS navigation |
| **Starting point** | Collector's `last_known_location` (requires GPS check-in); defaults to Kampala centre if no location recorded |
| **Stops** | Active assigned pickups (ASSIGNED, EN_ROUTE, ARRIVED statuses) |
| **Output** | Ordered pickup sequence with lat/lng and address |
| **Limitation** | Does not account for traffic, road types, time windows, or vehicle capacity. It is a suggested collection sequence, not turn-by-turn navigation. |

---

## 10. Attention Items Logic

The operational summary generates human-readable attention items based on:

| Condition | Severity | Message |
|---|---|---|
| `unassigned_backlog > 15` | HIGH | "X unassigned pickup requests are waiting for a collector" |
| `unassigned_backlog > 5` | MEDIUM | Same |
| `overdue_pickups` with `priority_label = HIGH` | HIGH | "X pickups are significantly overdue" |
| `overdue_pickups` with any priority | MEDIUM | "X pickups are overdue" |
| `failure_rate_percent > 20` | HIGH | "Collection failure rate is X% — above 20% threshold" |

Thresholds are currently hardcoded in `operational_service._build_attention_items()`. They should be made configurable for different operational contexts.
