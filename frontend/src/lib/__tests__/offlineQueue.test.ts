import "fake-indexeddb/auto";
import {
  enqueueAction,
  listQueuedActions,
  removeQueuedAction,
  updateQueuedActionError,
} from "@/lib/offlineQueue";

// Uses fake-indexeddb (a real, spec-compliant IndexedDB implementation for
// Node) rather than mocking window.indexedDB — so these tests exercise the
// actual IndexedDB transaction/store logic in offlineQueue.ts, not a stub of
// it. This is the same verification approach used manually during
// development (see docs/pwa.md) now captured as a real, repeatable test.

describe("offlineQueue", () => {
  it("starts empty", async () => {
    const actions = await listQueuedActions();
    expect(actions).toEqual([]);
  });

  it("enqueues an action with a real generated UUID and timestamp", async () => {
    const action = await enqueueAction({
      pickupId: "pickup-1",
      type: "complete_collection",
      payload: { quantity_kg: 12.5 },
    });

    expect(action.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(action.queuedAt).toBeTruthy();
    expect(new Date(action.queuedAt).toString()).not.toBe("Invalid Date");
    expect(action.pickupId).toBe("pickup-1");
  });

  it("persists the action so it can be listed back", async () => {
    await enqueueAction({ pickupId: "pickup-2", type: "status_update", payload: { status: "EN_ROUTE" } });
    const actions = await listQueuedActions();
    expect(actions.some((a) => a.pickupId === "pickup-2")).toBe(true);
  });

  it("removes an action from the queue after a successful sync", async () => {
    const action = await enqueueAction({ pickupId: "pickup-3", type: "fail_collection", payload: { failure_reason: "no access" } });
    await removeQueuedAction(action.id);
    const actions = await listQueuedActions();
    expect(actions.find((a) => a.id === action.id)).toBeUndefined();
  });

  it("records a conflict error on an action without removing it from the queue", async () => {
    const action = await enqueueAction({ pickupId: "pickup-4", type: "status_update", payload: { status: "ARRIVED" } });
    await updateQueuedActionError(action.id, "Cannot transition pickup from COLLECTED to ARRIVED");

    const actions = await listQueuedActions();
    const updated = actions.find((a) => a.id === action.id);
    expect(updated).toBeDefined();
    expect(updated?.lastError).toBe("Cannot transition pickup from COLLECTED to ARRIVED");
  });

  it("preserves multiple independently queued actions for different pickups", async () => {
    await enqueueAction({ pickupId: "pickup-5", type: "status_update", payload: { status: "EN_ROUTE" } });
    await enqueueAction({ pickupId: "pickup-6", type: "status_update", payload: { status: "ARRIVED" } });

    const actions = await listQueuedActions();
    const pickupIds = actions.map((a) => a.pickupId);
    expect(pickupIds).toEqual(expect.arrayContaining(["pickup-5", "pickup-6"]));
  });
});
