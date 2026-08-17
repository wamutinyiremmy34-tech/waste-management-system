# Offline Sync

See `docs/pwa.md` for the full picture. Summary:

- **Implemented**: service worker caching (cache-first for pages/assets, network-first with
  graceful fallback for API calls, and — as of this pass — offline navigation correctly serving a
  cached copy of the exact page requested rather than always falling back to a generic offline
  page), plus a real IndexedDB-backed write-queue for the collector app with genuine conflict
  handling and UI feedback (pending-sync badges, sync-in-progress banner, and surfaced conflict
  errors).
- **Not implemented**: Background Sync API registration (the queue currently flushes via the page's
  `online` event, which covers the app-stays-open case but not a fully-closed-tab background wake);
  offline photo-capture queuing for proof-of-collection uploads.

## Why the split

Read-path offline support (viewing cached pages/data) and write-path offline support (queuing
mutations for later sync) are different engineering problems. Both are now implemented for the
collector role, which is the one the spec calls out explicitly (section 28) as needing this. The
write-path implementation includes real conflict resolution — a rejected replay (e.g. the pickup
was reassigned while offline) is surfaced to the user with the server's actual error, not silently
dropped or retried forever — because a queue that doesn't handle conflicts is worse than no queue at
all (it would let a collector believe an action succeeded when it didn't).
