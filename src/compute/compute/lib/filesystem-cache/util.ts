import { open, utimes } from "fs/promises";

export async function touch(path: string, time?: Date) {
  if (time == null) {
    time = new Date();
  }
  try {
    await utimes(path, time, time);
  } catch (_) {
    await (await open(path, "w")).close();
    await utimes(path, time, time);
  }
}
