# Reporting (spec section 35)

## CSV export — implemented

Three real, working CSV endpoints, admin-role-gated:

- `GET /api/v1/reports/collections.csv`
- `GET /api/v1/reports/complaints.csv`
- `GET /api/v1/reports/recycling.csv`

Each streams actual database rows through Python's `csv` module and returns a real downloadable
file (`Content-Disposition: attachment; filename="..."`, `text/csv`) — not a static/canned file.
All three support optional `date_from`/`date_to` query parameters. `collections.csv` and
`complaints.csv` are automatically scoped to the caller's own waste company when the caller is a
`COMPANY_ADMIN` (not exposed as a parameter the client could tamper with — it's derived from the
authenticated user).

**Verified two ways**: an automated test downloads a complaints CSV and asserts the exact complaint
description appears in a parsed row (`tests/test_reports.py`), and a real file was downloaded from
the live server with `curl` and inspected — it contained the exact collection rows created earlier
in this project's own manual/API testing (a 7.2kg glass collection and an 18.5kg organic
collection), confirming the whole system's data is consistent end-to-end across sessions.

## PDF export — now implemented (was previously an honest documented gap)

Three sibling PDF endpoints, same query logic and scoping as their CSV counterparts:

- `GET /api/v1/reports/collections.pdf`
- `GET /api/v1/reports/complaints.pdf`
- `GET /api/v1/reports/recycling.pdf`

`app/services/pdf_report_service.py` builds a real, styled document using reportlab's Platypus API
(`SimpleDocTemplate`) — a branded header in EcoTrack's forest-green, a bold summary line with real
computed totals, and a properly styled table (dark-green header row, alternating row shading,
consistent padding) — not a bare unstyled dump of rows, which was the whole reason this was
originally deferred rather than shipped half-heartedly.

**Verified three ways, not assumed**:
1. Automated tests (`tests/test_reports.py`) open the generated PDF bytes with `pdfplumber`,
   extract the real text layer, and assert the actual report title and complaint description appear
   in it — confirming the content isn't just present in the response but genuinely encoded and
   extractable from the PDF structure.
2. A real PDF was downloaded from the live server with `curl`, confirmed to be a valid PDF via the
   Unix `file` command (`PDF document, version 1.4, 1 page(s)`), and its extracted text matched the
   real collection data in the database exactly (2 records, 25.7kg total, GLASS/ORGANIC categories).
3. The same downloaded PDF was rendered to an image and visually inspected — confirming the branded
   header, summary line, and table styling actually render correctly, not just parse as valid PDF
   structure with broken/invisible content.
4. An empty-result-set case (`date_from`/`date_to` covering no data) was tested explicitly and
   confirmed to still render a valid, well-formed PDF with a clear "No records found" message,
   rather than erroring or producing a blank/broken file.

## Environmental report — implemented

`GET /api/v1/reports/environmental.csv` and `GET /api/v1/reports/environmental.pdf` — a
summary-style report (not a row listing like the other three) showing total waste collected,
total recycled, diversion rate, and a per-category breakdown with estimated CO2e avoided. The
estimate is explicitly and visibly labeled as such in both formats — the PDF renders it in italics
with a pointer to `docs/environmental-impact.md`, and the CSV column header spells out
"(estimate — see docs/environmental-impact.md)" rather than a bare number that could be mistaken
for a precise measurement.

**Verified the same way as the other PDF reports**: automated tests parse the real PDF text and
confirm the diversion rate, the word "estimate," and category data all appear; a live download was
rendered to an image for visual inspection (confirmed the CO2e caveat text is legible and correctly
placed, not clipped or hidden); and the CSV was inspected directly, which — usefully — surfaced the
same "diversion rate can exceed 100%" edge case documented in `docs/environmental-impact.md` in a
new context (632.3% here, versus 466.93% observed via the recycler dashboard), reinforcing that this
is a consistent, understood property of the data model rather than a one-off glitch.

Both are wired into the admin dashboard's report buttons (`/admin`).

## Frontend integration

The admin dashboard (`/admin`) now has a "Reports" panel with CSV/PDF download buttons for all
four report types (collections, complaints, recycling, environmental). Since these are authenticated endpoints, a plain `<a href>` wouldn't work
(browsers don't attach a Bearer token to a navigation) — `downloadAuthenticatedFile()` in
`frontend/src/lib/api.ts` fetches the file as a blob with the token attached, then triggers a real
browser download via a temporary object URL. This is currently only wired into the admin dashboard;
company/organization dashboards don't have report download buttons yet (their scoped reports remain
fully usable via direct URL or `/docs`).

## Filtering beyond date-range — now implemented

- `GET /api/v1/reports/collections.{csv,pdf}` accepts optional `organization_id` and `zone_id`
  query parameters, filtering to pickups requested by a given organization or assigned to a given
  collection zone respectively.
- `GET /api/v1/reports/recycling.{csv,pdf}` accepts an optional `recycler_id` parameter, letting an
  admin drill into a single recycling partner's records.

These compose safely with the existing automatic company-scoping for `COMPANY_ADMIN` — the new
filters are `AND`ed onto the query, so passing an `organization_id`/`zone_id`/`recycler_id` that
belongs to a different tenant than the one already implied by the caller's role just returns zero
rows, never a wider result than the caller was already allowed to see. Verified with two dedicated
tests: a real filtered request returns exactly the matching row, and a request filtered by an
unrelated organization/recycler UUID returns nothing — both checked against real data, not just
that the endpoint accepts the parameter without erroring.

## What's not covered yet

- No dedicated report-download UI for these new filters yet — they're available via the API/`/docs`
  but the admin dashboard's report buttons don't expose filter inputs (they always request the
  unfiltered report). A reasonable next step given the buttons and backend filtering both already
  exist.
- `complaints.{csv,pdf}` and `environmental.{csv,pdf}` still only support date-range filtering —
  complaints have no organization/zone reference to filter by in the current schema, and the
  environmental report is intentionally platform-wide (see `docs/environmental-impact.md`).
