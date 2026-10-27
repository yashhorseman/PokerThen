import type { SocketLike } from "./session";

/** Real browser WebSocket as a SocketLike. */
export function createBrowserSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}
