import { promises as fs } from "node:fs";
import { join } from "node:path";

// Minimal async "which" helper. Returns absolute path if found in PATH.
export async function which(binary: string): Promise<string | null> {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(":").filter(Boolean);
  for (const part of parts) {
    const candidate = join(part, binary);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next PATH entry
    }
  }
  return null;
}
