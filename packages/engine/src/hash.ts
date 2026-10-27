/** Synchronous SHA-256 (node:crypto). Produces the same bytes as the shared pure/WebCrypto implementations (tested). No randomness here. */
import { createHash } from "node:crypto";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
