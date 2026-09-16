// Non-standard / experimental browser APIs used by lib/deviceTier.js, not in
// lib.dom.d.ts. Optional because they're absent on Safari/Firefox (§8.1).
interface Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

// Debug handles useSceneManager.js attaches in dev only (CLAUDE.md §17 SDK
// alignment — kept untyped since they alias the vendored SDK's own objects).
interface Window {
  __LCC?: unknown;
  __scene?: unknown;
  __camera?: unknown;
}
