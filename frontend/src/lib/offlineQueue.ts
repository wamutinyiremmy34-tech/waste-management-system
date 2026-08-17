"use client";

/**
 * Offline write-queue for the collector app (spec section 28 — the "write
 * path" half of PWA offline support; the "read path"/caching half lives in
 * public/service-worker.js). Uses the browser's real IndexedDB, not
 * localStorage (which the artifact/demo environment forbids anyway, and
 * which is a poor fit for structured queued actions in a real app besides).
 *
 * Design:
 * - Each queued action is one of: status update, complete collection, fail
 *   collection — the same three write operations the collector UI performs.
 * - Actions are stored with a client-generated UUID, the pickup ID, a
 *   type, a payload, and a queued-at timestamp.
 * - Flushing replays them against the real API in the order they were
 *   queued. If the server rejects an action (e.g. the pickup's state moved
 *   on server-side while offline — a genuine conflict, not just a transient
 *   network blip), that specific action is marked failed with the server's
 *   reason instead of being retried forever, and the UI surfaces it instead
 *   of silently dropping it.
 */

const DB_NAME = "ecotrack-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending_actions";

export type QueuedActionType = "status_update" | "complete_collection" | "fail_collection";

export interface QueuedAction {
  id: string;
  pickupId: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  queuedAt: string;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueAction(action: Omit<QueuedAction, "id" | "queuedAt">): Promise<QueuedAction> {
  const db = await openDb();
  const full: QueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(full);
    tx.oncomplete = () => resolve(full);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedAction[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removeQueuedAction(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateQueuedActionError(id: string, error: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as QueuedAction | undefined;
      if (record) {
        record.lastError = error;
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
