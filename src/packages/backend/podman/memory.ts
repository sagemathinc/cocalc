import { readFile } from "node:fs/promises";

/** Total physical RAM in bytes (not counting swap). */
let cached: { ram: number; swap: number } | null = null;
export async function getTotalMemoryBytes(): Promise<{
  ram: number;
  swap: number;
}> {
  if (cached != null) {
    return cached;
  }
  const text = await readFile("/proc/meminfo", "utf8");
  let m = text.match(/^MemTotal:\s+(\d+)\s+(\w+)/m);
  if (!m) {
    throw new Error("MemTotal not found in /proc/meminfo.");
  }
  const value = parseInt(m[1], 10);
  const unit = m[2].toLowerCase(); // typically "kB"

  const mult: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
  };
  if (mult[unit] == null) {
    throw Error(`unknown unit ${unit}`);
  }
  const ram = value * mult[unit];

  let swap;
  m = text.match(/^SwapTotal:\s+(\d+)\s+(\w+)/m);
  if (!m) {
    swap = 0;
  } else {
    const value = parseInt(m[1], 10);
    const unit = m[2].toLowerCase(); // typically "kB"
    if (mult[unit] == null) {
      throw Error(`unknown unit ${unit}`);
    }
    swap = value * mult[unit];
  }

  cached = { ram, swap };
  return cached;
}

/*
See https://youtu.be/lgrdpUF-9-w?si=THwEEaC5VX8mGoEd&t=1278

The speaker recommends that for containers a formula for swap
based on the memory request.  We are only using a memory limit,
so we use that instead.  He suggests to compute the percent
of RAM the pod is guaranteed, then multiply that by the swap configured
on the machine, and use that for swap for the container.
*/

export async function getContainerSwapSizeMb(
  memoryLimitBytes: number,
): Promise<number> {
  const { ram, swap } = await getTotalMemoryBytes();
  return Math.round(swap * (memoryLimitBytes / ram));
}
