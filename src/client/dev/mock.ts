// PLACEHOLDER - owned by the table agent.
// `installMockIfRequested()` is called by the game page before connecting.  If the URL has `?mock=<scenario>` it installs a mock
// backend (setMockBackend + applyFrame from src/client/net/connection.ts) and returns true (the real websocket must then NOT be started).
export function installMockIfRequested(): boolean { return false; }
