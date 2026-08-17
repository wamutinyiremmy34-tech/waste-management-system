import "@testing-library/jest-dom";

// jsdom's global scope doesn't provide structuredClone, which fake-indexeddb
// (used for real IndexedDB-backed tests of the offline queue) needs for its
// internal value-cloning on put()/add(). Node's own v8 module gives a
// reliable structuredClone-equivalent for plain-object payloads like ours.
if (typeof globalThis.structuredClone === "undefined") {
  const v8 = require("node:v8");
  globalThis.structuredClone = (value: unknown) => v8.deserialize(v8.serialize(value));
}

// React 19's concurrent-act-environment check needs this global set explicitly
// in Jest (unlike Vitest, which sets it automatically) — without it, async
// state updates inside act() still emit spurious "not wrapped in act"
// warnings even when they genuinely are wrapped.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
