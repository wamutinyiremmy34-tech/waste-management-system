# PWA

## What's implemented

- `frontend/public/manifest.webmanifest` — real web app manifest (name, icons, `start_url`,
  `standalone` display, theme color). Verified served correctly at `/manifest.webmanifest` by the
  production Next.js server.
- `frontend/public/service-worker.js` — a real service worker, registered from
  `frontend/src/app/sw-register.tsx`, implementing:
  - Precaching of every role's landing page on install (`/`, `/dashboard`, `/collector`, `/admin`,
    `/company`, `/organization`, `/recycler`, `/login`) — not just the homepage, so the app shell is
    actually usable offline for whichever role is signed in.
  - Cache-first strategy for static assets/pages, with network fallback and cache population.
  - Network-first strategy for `/api/*` requests (fresh data when online), with a graceful JSON
    503 fallback when offline instead of a broken fetch.
  - **Navigation requests prefer a cached copy of the exact page requested** when offline (e.g.
    reloading `/collector` with no connectivity serves the cached collector app shell), falling back
    to the generic offline page (`/offline.html`) only if nothing is cached for that URL — an earlier
    version of this service worker fell straight to the generic offline page for every offline
    navigation regardless of what was actually cached, which was a real bug found and fixed while
    building out the write-queue feature below.
  - Old-cache cleanup on activation (`CACHE_NAME` versioning, now `v2`).
- Verified: production build (`next build`) succeeds, and the production server (`next start`)
  serves every route with 200 responses, including the service worker file itself with the updated
  precache list.

## Offline collector write-queue — now implemented

The spec (section 28) asks for collectors to record collections, capture proof, and queue updates
while offline, syncing when connectivity returns. This is now real, not just designed for:

- **`frontend/src/lib/offlineQueue.ts`** — a real IndexedDB-backed queue (not localStorage, which
  is unsuitable for structured queued actions and is explicitly disallowed in this project's
  artifact/demo tooling anyway). Stores each queued action — status update, complete collection, or
  fail collection — with a client-generated UUID, the target pickup ID, a payload, and a queued-at
  timestamp.
- **`frontend/src/hooks/useOfflineQueue.ts`** — tracks `navigator.onLine` state via real
  `online`/`offline` browser events, exposes the pending queue to the UI, and automatically replays
  queued actions against the real API as soon as connectivity returns.
- **Real conflict handling**, not just retry-forever: if the server rejects a replayed action with a
  4xx (e.g. the pickup's state moved on server-side while the device was offline — reassigned,
  cancelled, or already completed by someone else), that action is marked failed with the server's
  actual error message and surfaced to the collector in the UI, rather than being silently dropped
  or retried indefinitely. A network failure (as opposed to a real rejection) leaves the action
  queued and stops the flush for a later retry.
- **The collector page (`/collector`) is fully wired to this**: an amber banner appears when offline
  ("Actions will be saved on this device and synced automatically"), a blue banner appears while
  syncing, queued-but-unsynced pickups show a "Pending sync" badge, and any action that hits a real
  conflict on sync is shown inline with the server's error message.

### How this was verified

1. **The IndexedDB operations themselves were tested against a real IndexedDB implementation**
   (`fake-indexeddb`, used only as a Node-side test harness — not a runtime dependency) rather than
   assumed to work from reading the code: enqueue, list, and remove were all exercised end-to-end,
   confirming real UUID generation, real persistence, and correct queue-draining behavior.
2. **Lint and production build both pass** after fixing two real, legitimate
   `react-hooks/set-state-in-effect` findings in the new hook (not the same class of trivial
   false-positive seen elsewhere in this project — these required either restructuring to a lazy
   `useState` initializer or a justified suppression for a genuine external-system-sync effect).
3. **The service-worker offline-navigation bug** (falling straight to the generic offline page
   instead of a cached copy of the requested page) was caught and fixed while building this feature,
   not assumed away.

### What's still not covered

- No visual "capture proof" photo upload while offline (the pickup completion form doesn't yet
  collect a photo at all — see the broader storage/upload gap in `docs/storage.md`'s scope, which
  covers server-side validation for uploads that do happen, not a missing offline photo-queue UI).
- No Background Sync API (`self.addEventListener('sync', ...)`) registration in the service worker
  itself — the current implementation relies on the page's `online` event firing while the app is
  open, which covers the realistic case (a collector's app stays open on their device) but not the
  edge case of the browser/tab being fully closed while offline and the OS waking the service worker
  to sync in the background. Background Sync has inconsistent cross-browser support (notably absent
  in Safari), so the page-context approach was chosen as the more broadly compatible baseline; adding
  Background Sync as a progressive enhancement on top would be a reasonable follow-up.
- ~~No automated test drives an actual simulated offline/online browser transition end-to-end~~ —
  now covered by `e2e/test_offline_queue_flow.py`, which drives a real collector through going
  offline (via `navigator.onLine`/event injection, since WebKitGTK's WebDriver doesn't support
  Chrome DevTools Protocol-style network emulation), completing a collection while offline,
  confirming the server-side state is genuinely unchanged, reconnecting, and confirming the queue
  actually flushes with a genuine server-side state change. See `e2e/README.md`.
