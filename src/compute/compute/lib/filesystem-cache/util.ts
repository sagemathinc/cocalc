import { open, utimes } from "fs/promises";

export async function touch(path: string) {
  const now = new Date();
  try {
    await utimes(path, now, now);
  } catch (_) {
    await (await open(path, "w")).close();
  }
}
