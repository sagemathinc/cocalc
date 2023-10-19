import { open, stat, utimes } from "fs/promises";

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

// get mtime of file or new Date(0) if no such file
export async function getmtime(path: string): Promise<Date> {
  try {
    return (await stat(path)).mtime;
  } catch (_) {
    return new Date(0);
  }

}