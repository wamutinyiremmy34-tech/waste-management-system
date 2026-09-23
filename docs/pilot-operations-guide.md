# Pilot Operations Guide

**For: Oars Technologies — EcoTrack Uganda Pilot Operations**

This guide describes the daily operational workflow for running a controlled waste-management
pilot using EcoTrack. It covers the Municipal Administrator, Company Administrator, and Collector
roles. Refer to `docs/pilot-runbook.md` for setup, emergency procedures, and teardown.

---

## Daily Workflow

### Morning — Command Centre Review

**Municipal Admin / Company Admin**

1. **Open the Command Centre**
   - Navigate to `https://your-pilot-domain.com/admin` (or `/company`)
   - Login with your credentials

2. **Review Operational Health** (Overview tab)
   - Check the attention item banners at the top of the page
   - Note: `HIGH` severity items require immediate action
   - Review completion rate — target ≥ 70%
   - Check unassigned backlog — target < 5

3. **Review Priority Queue** (Priority Queue tab)
   - Items marked `HIGH` have score ≥ 10 (overdue + full bins + nearby complaints)
   - Each item shows the score breakdown — understand *why* it is high priority
   - Assign a collector to any unassigned HIGH items via `POST /api/v1/pickups/{id}/assign`

4. **Inspect the Map** (Map tab)
   - Toggle layers to understand the geographic distribution
   - Red circles = hotspot clusters (multiple complaints in the same area)
   - Red/amber squares = bins at high fill levels
   - Purple dots = unresolved complaints
   - Dark squares = active pickup requests

5. **Review Hotspots**
   - Hotspots are spatial complaint clusters from PostGIS analysis — not predictions
   - A hotspot with 5+ complaints in the same area needs a priority collection response
   - Cross-reference hotspot locations with the zone map to identify which team is responsible

6. **Check Zone Performance** (Zones tab)
   - Zones marked "NEEDS ATTENTION" have: completion rate < 60%, or unresolved complaints > 3
   - Review waste_collected_kg per zone to confirm collections are being logged

7. **Verify Collector/Vehicle Availability**
   - Company dashboard shows collector performance table
   - Check that AVAILABLE vehicles match scheduled collector count
   - Mark vehicles as MAINTENANCE if out of service

---

### Mid-Morning — Collector Briefing

**Company Admin → Collectors**

1. Confirm collector assignments via the Company dashboard or API
2. Ensure each collector knows their zone assignment
3. For any HIGH-priority pickups, confirm the assigned collector has received the assignment

---

### Field Operations — Collector Workflow

**On each collector's device (mobile browser)**

1. **Open** `https://your-pilot-domain.com/collector`
2. **Start Route**
   - Tap the green "📍 Start route" button
   - Accept the location permission prompt
   - Your device location is sent to EcoTrack for route optimisation
   - Pickups are reordered into the suggested nearest-neighbour sequence
   - If location is denied: pickups show in default order — workflow continues
3. **Work through stops in order** (Stop 1 → Stop 2 → …)
   - Each stop shows the pickup category, address, and status badge
4. **At each stop:**
   - Tap "Start route" → "Mark arrived" to progress the pickup
   - On arrival at ARRIVED status, either:
     - **Complete:** Enter weight in kg, add optional notes, tap Submit
     - **Fail:** Enter the reason (access blocked, not home, etc.), tap Submit
5. **If connectivity is lost:**
   - The amber banner "You're offline" appears
   - Continue completing or failing pickups — actions are saved locally (IndexedDB)
   - When connectivity returns, the sync banner appears and queued actions sync automatically
   - Do NOT repeat a completion already queued — wait for sync confirmation

---

### Mid-Day — Exception Handling

**Municipal Admin / Company Admin**

1. **Failed collections** — check the Priority Queue for any pickups that have just failed
   - Review the failure reason (from the collector)
   - If legitimate blockage: note for infrastructure/access resolution
   - If collector issue: contact the collector
   - Reschedule: create a new pickup request if needed

2. **Unresolved complaints** — check Complaints tab
   - Move complaints through the workflow: REPORTED → UNDER_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED
   - For complaints near active hotspots: prioritise resolution

3. **Monitor the operational health banners** — if HIGH alerts appear:
   - BACKLOG > 15: assign collectors immediately
   - FAILURE RATE > 20%: investigate root cause (vehicle breakdown? access issues?)
   - OVERDUE pickups: contact the responsible collector

---

### End of Day — Review and Reporting

**Municipal Admin**

1. **Check daily collection trend** (Overview tab → trend chart)
   - Completed collections should form a consistent daily bar
   - A gap day indicates a problem — investigate

2. **Download reports** (Reports tab)
   - `collections.csv/pdf` — full day's collection record
   - `complaints.pdf` — complaint summary
   - Set date range to today for daily report

3. **Record daily metrics** against the pilot baseline (see `docs/pilot-metrics.md`)

4. **Back up the database** (see `docs/backup-and-recovery.md`)
   ```bash
   docker exec ecotrack_db pg_dump -U ecotrack -d ecotrack_prod \
     --format=custom --file=/tmp/daily_$(date +%Y%m%d).pgdump
   docker cp ecotrack_db:/tmp/daily_$(date +%Y%m%d).pgdump ./backups/
   ```

---

## Operational Feedback Loop

EcoTrack's operational feedback loop connects data to action to improved data:

```
Hotspot detected (spatial complaint cluster)
          ↓
Priority pickup identified (CollectionPrioritizer score)
          ↓
Collector assigned via Company dashboard
          ↓
Collector checks in location → Route optimised
          ↓
Collection completed → WasteRecord created
          ↓
Complaint resolved → Zone unresolved_complaints decreases
          ↓
Next-day metrics show improvement
```

**Important:** The loop only closes if complaints are updated to RESOLVED after the underlying
issue is addressed. Unresolved complaints continue contributing to hotspot scores and zone
attention flags. Train admins to close complaints promptly.

---

## Complaint → Operation Connection

When a complaint is filed:
1. Its location is stored in PostGIS
2. It contributes to hotspot detection (ST_ClusterDBSCAN)
3. It contributes to priority scores for nearby pickups (ST_DWithin, 500m radius)
4. It appears as a purple dot on the operational map

To connect a complaint to a specific operation:
1. Open the Map tab — find the complaint location
2. Note which zone it falls within (hover/click the zone boundary)
3. Check Zone Performance tab for that zone's active pickup count
4. If no pickup is covering the area, create one: `POST /api/v1/pickups` via the API or citizen app

---

## Pilot Feedback Collection

During the pilot, collect operational feedback in three categories:

**1. Workflow problems**
- Which steps in the collector workflow are confusing?
- Are the stop-order suggestions useful or ignored?
- Is the offline queue working reliably?

**2. Information gaps**
- What do operators wish they could see that is not currently displayed?
- Are the priority scores reflecting real-world urgency?

**3. Technical issues**
- Any sync failures that weren't auto-resolved?
- Any map tiles failing to load?
- Any backend errors (check logs: `docker compose logs backend | grep ERROR`)

Use the existing complaint system (`POST /api/v1/complaints`) for internal technical issues
during the pilot — set category to `OTHER` and description to the technical issue. This creates
a structured record of pilot problems without requiring a separate system.

---

## Key Contacts and Access

| Role | Access | Credentials location |
|---|---|---|
| SUPER_ADMIN | Full platform access | Stored in password manager |
| MUNICIPAL_ADMIN | Platform analytics, complaint management | — |
| COMPANY_ADMIN | Company operations, collector management | — |
| COLLECTOR | Field app only | Provided by Company Admin |

Password reset: `POST /api/v1/auth/password-reset/request`
(token returned in response for pilot — admin relays to user)

---

## Escalation

| Issue | First response | Escalation |
|---|---|---|
| Failed collection | Company Admin notified | Schedule retry pickup |
| Persistent hotspot (3+ days) | Review complaint details | Municipal Admin priority |
| Collector offline > 2 hours | Phone contact | Reassign pickups |
| Backend error (`500`) | Check logs with `correlation_id` | See `docs/pilot-runbook.md` |
| Map not loading | Verify internet connectivity | Tiles from OpenStreetMap |
| Database issue | Health check: `/api/v1/health` | See `docs/backup-and-recovery.md` |
