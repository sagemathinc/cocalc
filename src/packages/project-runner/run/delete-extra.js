/*
Remove files from lowerdir that were deleted in merged.
The file list deleted.nul is updated each time we make
a backup, and is a NUL separated list of all deleted
paths. We use NUL because filenames can contain newlines
and any other character.
*/

const fs = require("fs");
const path = require("path");

const target = "/rootfs/merged";
const deletedPath = "/rootfs/merged/root/deleted.nul";

if (!fs.existsSync(deletedPath)) {
  // never made a deleted.nul list, so nothing to do.
  process.exit(0);
}

// Read NUL-terminated list as raw bytes; split by 0x00 without corrupting names
const buf = fs.readFileSync(deletedPath);
let parts = [];
let start = 0;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x00) {
    if (i > start) parts.push(buf.toString("utf8", start, i));
    start = i + 1;
  }
}
// Normalize: strip leading "./"
parts = parts
  .map((p) => (p.startsWith("./") ? p.slice(2) : p))
  .filter((p) => p.length);

// 1) Delete files/symlinks first
for (const rel of parts) {
  const p = path.join(target, rel);
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
  } catch (_) {
    /* not there, fine */
  }
}

// 2) Delete directories deepest-first (only if empty)
parts.sort((a, b) => b.split("/").length - a.split("/").length);
for (const rel of parts) {
  const p = path.join(target, rel);
  try {
    const st = fs.lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      try {
        fs.rmdirSync(p);
      } catch (_) {}
    }
  } catch (_) {}
}
