/*
This is needed on non-Linux instead of using find. We just have to do it directly.
*/

import { join } from "path";
import * as fs from "fs/promises";

import type {
  FileTypeLabel,
  FileData,
  Files,
} from "@cocalc/conat/files/listing";
export type { Files };

export default async function getListing(
  path: string,
): Promise<{ files: Files; truncated?: boolean }> {
  const files: Files = {};

  // Helper to map stats to your FileTypeLabel
  const fileTypeLabel = (st: any): FileTypeLabel => {
    if (typeof st?.type === "string") return st.type as FileTypeLabel; // honor fs.lstat extension if present
    if (st.isSymbolicLink?.()) return "l";
    if (st.isDirectory?.()) return "d";
    if (st.isBlockDevice?.()) return "b";
    if (st.isCharacterDevice?.()) return "c";
    if (st.isSocket?.()) return "s";
    if (st.isFIFO?.()) return "p";
    return "f";
  };

  // Prefer opendir (streaming, resilient to large dirs); fall back to readdir
  let names: string[] = [];
  const dir = await fs.opendir(path);
  for await (const dirent of dir as AsyncIterable<{ name: string }>) {
    // Skip "." and ".." if the implementation happens to surface them
    if (dirent?.name === "." || dirent?.name === "..") continue;
    names.push(dirent.name);
  }

  // lstat (not stat!) each entry; resolve link target only for symlinks
  // Do these in parallel.
  await Promise.allSettled(
    names.map(async (name) => {
      const full = join(path, name);
      try {
        const st = await fs.lstat(full);
        const type = fileTypeLabel(st);
        const data: FileData = {
          mtime: st.mtimeMs, // ms since epoch (matches your original parsing)
          size: st.size,
          type,
        };

        if (type === "l" || st.isSymbolicLink?.()) {
          data.isSymLink = true;
          try {
            data.linkTarget = await fs.readlink(full);
          } catch {
            // ignore unreadable targets (permissions/race)
          }
        }
        if (type === "d" || st.isDirectory?.()) {
          data.isDir = true;
        }

        files[name] = data;
      } catch (err: any) {
        // Handle races: entry could have been deleted between listing and lstat
        if (err?.code === "ENOENT") {
          // just skip
          return;
        }
        // For other errors, mirror your existing behavior: warn and skip
        console.warn("WARNING (getListing):", err);
      }
    }),
  );

  return { files, truncated: false };
}
