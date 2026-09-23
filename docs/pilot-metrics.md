# Pilot Metrics Framework

This document defines how EcoTrack measures pilot performance. Every metric
is calculable from existing database data. No metrics are fabricated.

---

## 1. Collection Performance

### Completion Rate
**Definition:** Fraction of terminal-status pickups that were successfully collected.  
**Formula:** `COLLECTED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100`  
**Source:** `pickup_requests.status`  
**API:** `GET /operations/operational-summary` → `kpis.completion_rate_percent`  
**Target (pilot):** ≥ 70%  
**Baseline:** Record at pilot start via `/analytics/admin-dashboard`

### Failed Collection Rate
**Definition:** Fraction of terminal pickups that failed.  
**Formula:** `FAILED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100`  
**Target (pilot):** ≤ 15%

### Missed Collection Rate
**Definition:** Fraction of terminal pickups that were missed entirely.  
**Formula:** `MISSED / (COLLECTED + FAILED + MISSED + CANCELLED) × 100`  
**Target (pilot):** ≤ 10%

### Overdue Pickup Count
**Definition:** Number of REQUESTED or ASSIGNED pickups past their preferred date.  
**Formula:** `COUNT(pickups WHERE status IN ('REQUESTED','ASSIGNED') AND today > preferred_date)`  
**API:** `GET /operations/operational-summary` → `overdue_count`  
**Target (pilot):** < 10 outstanding at any given time

### Unassigned Backlog
**Definition:** REQUESTED pickups with no collector assigned.  
**API:** `GET /operations/operational-summary` → `kpis.unassigned_backlog`  
**Target (pilot):** < 5 unassigned overnight

### Average Collection Weight
**Definition:** Mean kg per successful collection.  
**Formula:** `AVG(collections.quantity_kg WHERE was_successful = TRUE)`  
**API:** `GET /operations/operational-summary` → `kpis.avg_collection_weight_kg`  
**Use:** Trend indicator — sustained drop may indicate incomplete logging.

---

## 2. Complaint Metrics

### Complaint Volume
**Definition:** Total complaints filed in the pilot period.  
**Formula:** `COUNT(complaints WHERE created_at BETWEEN pilot_start AND today)`  
**API:** `GET /analytics/complaint-analytics` → `total`

### Unresolved Complaints
**Definition:** Complaints not yet in RESOLVED or REJECTED status.  
**API:** `GET /analytics/admin-dashboard` → `unresolved_complaints`  
**Target (pilot):** < 20% of total remain unresolved at 30 days

### Resolution Rate
**Definition:** Fraction of complaints resolved.  
**Formula:** `RESOLVED / total × 100`  
**API:** `GET /analytics/complaint-analytics` → `resolution_rate_percent`  
**Target (pilot):** ≥ 60% within 30 days

### Complaint Concentration by Zone
**Definition:** Number of unresolved complaints within each zone boundary.  
**Formula:** `COUNT(complaints WHERE ST_Contains(zone.boundary, complaint.location) AND status != 'RESOLVED')`  
**API:** `GET /operations/zone-performance` → per zone `unresolved_complaints`  
**Use:** Identify geographic problem areas.

### Active Hotspot Count
**Definition:** Number of complaint spatial clusters (min 3 complaints within 300m).  
**API:** `GET /operations/hotspots` → `total_clusters`  
**Use:** Monitor whether operational response is reducing cluster density.

---

## 3. Operational Metrics

### Collector Completion Rate
**Definition:** Per-collector fraction of successful collections.  
**Formula:** `completions / (completions + failures) × 100`  
**API:** `GET /operations/collector-performance`  
**Use:** Identify collectors needing support.

### Vehicle Availability
**Definition:** Fraction of fleet vehicles in AVAILABLE or IN_SERVICE status.  
**Formula:** `COUNT(AVAILABLE + IN_SERVICE) / COUNT(all) × 100`  
**Source:** `vehicles.status`  
**API:** `GET /vehicles`  
**Target (pilot):** ≥ 80% available on any given day

### Priority Queue Size
**Definition:** Total REQUESTED + ASSIGNED pickups with a score > 0.  
**API:** `GET /operations/priority-queue` → `total`  
**Target (pilot):** ≤ 20 high-priority items unresolved

### High-Priority Backlog
**Definition:** Pickups with priority_label = HIGH (score ≥ 10).  
**API:** `GET /operations/priority-queue` → count items where `priority_label == "HIGH"`  
**Target (pilot):** 0 HIGH items remaining overnight

### Zone Performance
**Definition:** Per-zone completion rate and complaint count.  
**API:** `GET /operations/zone-performance`  
**Attention trigger:** completion_rate < 60% OR unresolved_complaints > 3

---

## 4. Recycling & Environmental

### Total Waste Collected
**Formula:** `SUM(waste_records.quantity_kg)`  
**API:** `GET /operations/environmental-impact` → `total_waste_collected_kg`

### Total Waste Recycled
**Formula:** `SUM(recycling_records.quantity_kg)`  
**API:** `GET /operations/environmental-impact` → `total_waste_recycled_kg`

### Diversion Rate
**Formula:** `recycled_kg / collected_kg × 100`  
**API:** `GET /operations/environmental-impact` → `diversion_rate_percent`  
**Target (pilot):** ≥ 20%

### Estimated CO₂e Avoided
**Formula:** `SUM(recycled_qty_by_category × CO2E_FACTOR[category])`  
**API:** `GET /operations/environmental-impact` → `estimated_co2e_avoided_kg`  
**Note:** Estimate only — see `docs/environmental-impact.md` for factor assumptions.

---

## 5. Geographic Metrics

### Hotspot Count
**Definition:** Number of active complaint spatial clusters.  
**API:** `GET /operations/hotspots` → `total_clusters`  
**Target:** Reduce from baseline over pilot duration.

### Zone Completion Rate (worst zone)
**Definition:** Lowest zone completion_rate_percent across all active zones.  
**API:** `GET /operations/zone-performance` → min(completion_rate_percent)  
**Target:** All zones ≥ 60% completion rate.

---

## 6. Pilot Baseline Template

Record these values on the day the pilot starts:

| Metric | Baseline value | Date recorded |
|---|---|---|
| Total pickup requests | | |
| Completion rate (%) | | |
| Unresolved complaints | | |
| Active hotspot count | | |
| Total waste collected (kg) | | |
| Diversion rate (%) | | |
| Vehicle availability (%) | | |
| Active collectors | | |
| Active zones | | |

**Pilot start date:** _________________  
**Pilot scope (zones):** _________________  
**Participating entities:** _________________  
**Expected duration:** _________________

---

## 7. Success Criteria for Controlled Pilot

The pilot is considered successful if at end of 30 days:

| Criterion | Target |
|---|---|
| Completion rate | ≥ 70% |
| Failed collection rate | ≤ 15% |
| Unresolved complaints | < 20% of total |
| All HIGH-priority pickups resolved | Yes |
| Zero cross-tenant data leaks confirmed | Yes |
| Offline collector sync working | Yes |
| All existing tests passing | Yes |

---

## 8. Data Limitations

- **Overdue calculation** depends on `preferred_date` being set by citizens. If not set, a 2-day grace period is used — an operational policy choice.
- **CO₂e estimates** use configurable per-category factors; not verified measurements.
- **Diversion rate** can exceed 100% if recyclers receive material from outside EcoTrack-tracked pickups.
- **Collector performance** counts total collections; does not normalise by days worked.
- **Zone metrics** only count pickups with `assigned_zone_id` explicitly set.
