/*
Given an array keys of strings that contain SSH public keys and a path to an
authorized_keys file, this function:

- opens the authorized_keys file (treats missing file as empty)

- for every key that is in keys but missing in authorized_keys, it adds it with the line
"# Added by CoCalc" on the previous line.

- for every key that is in authorized_keys that ALSO has previous line "# Added by CoCalc"
but is not in the array keys, it deletes it from the file.

- it leaves everything else unchanged and writes the file back to disk.
*/

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const MARKER = "# Added by CoCalc";

/** Normalize a key line for comparison (trim + collapse whitespace). */
function normalizeKeyLine(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export async function updateAuthorizedKeys({
  keys,
  path,
}: {
  keys: string[];
  path: string;
}) {
  // Normalize input keys and de-duplicate
  const desiredKeys = Array.from(new Set(keys.map((k) => normalizeKeyLine(k))));

  // Read file (treat missing file as empty)
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") {
      text = "";
    } else {
      throw err;
    }
  }

  // Split into lines without losing empty tail information
  // We'll re-join with '\n' and ensure a trailing newline at the end.
  const lines = text.length ? text.split(/\r?\n/) : [];

  // Build a set of existing normalized key lines (anywhere in the file)
  const existingKeySet = new Set<string>();
  for (const line of lines) {
    const norm = normalizeKeyLine(line);
    if (norm && !norm.startsWith("#")) {
      existingKeySet.add(norm);
    }
  }

  // Pass 1: Remove MARKER+key blocks where the key is no longer desired.
  // We walk through lines and build a new array.
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (normalizeKeyLine(line) === MARKER && i + 1 < lines.length) {
      const keyLine = lines[i + 1];
      const keyNorm = normalizeKeyLine(keyLine);

      // If the next line (key) is NOT in desiredKeys, skip both lines.
      // Otherwise, keep both.
      if (!desiredKeys.includes(keyNorm)) {
        i++; // skip key line as well
        continue; // drop this pair
      } else {
        // Keep the marker and the key
        result.push(line);
        result.push(keyLine);
        i++; // we already handled the key line
        continue;
      }
    }

    // Default: keep the line
    result.push(line);
  }

  // Recompute existing key set after deletions (so additions logic is accurate)
  const existingAfterDeletion = new Set<string>();
  for (const line of result) {
    const norm = normalizeKeyLine(line);
    if (norm && !norm.startsWith("#")) {
      existingAfterDeletion.add(norm);
    }
  }

  // Pass 2: Append any desired keys that are missing.
  const additions: string[] = [];
  for (const key of desiredKeys) {
    if (!existingAfterDeletion.has(key)) {
      additions.push(MARKER, key);
      existingAfterDeletion.add(key); // avoid double-adding if duplicates in input
    }
  }

  // If we’re adding, ensure there’s a separating blank line if the file
  // already has content and doesn’t end with a blank line.
  if (additions.length > 0) {
    if (
      result.length > 0 &&
      normalizeKeyLine(result[result.length - 1]) !== ""
    ) {
      result.push(""); // add a blank line for readability
    }
    result.push(...additions);
  }

  // Ensure the file ends with a single trailing newline
  let out = result.join("\n");
  if (!out.endsWith("\n")) out += "\n";

  if (out.trim().length == 0 && text.trim().length == 0) {
    // if no keys, do not create file
    return;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, out, { encoding: "utf8", mode: 0o600 });
}
