import abspath from "./abspath";
import { path_split } from "@cocalc/util/misc";
import { exists, mkdir } from "fs";
import { callback } from "awaiting";

// Make sure that that the directory containing the file indicated by
// the path exists and has restrictive permissions.
export default async function ensureContainingDirectoryExists(
  path: string
): Promise<void> {
  path = abspath(path);
  const containingDirectory = path_split(path).head; // containing path
  if (!containingDirectory) return;

  if (await callback(exists, containingDirectory)) {
    // it exists, yeah!
    return;
  }
  // Doesn't exist, so create, via recursion: make sure the containing
  // directory of the containing directory exists!
  await ensureContainingDirectoryExists(containingDirectory);

  // Now make our directory itself:
  try {
    await callback(mkdir, containingDirectory, 0o700);
  } catch (err) {
    if (err?.code === "EEXIST") {
      // no problem -- it exists.
      return;
    } else {
      throw err;
    }
  }
}
