// Any non-absolute path is assumed to be relative to the user's home directory.
// This function converts such a path to an absolute path.

import { join } from "path";

export default function abspath(path: string): string {
  if (path.length === 0) {
    return process.env.HOME ?? "";
  }
  if (path.startsWith("/")) {
    return path; // already an absolute path
  }
  // The regexp is to get rid of /./, which is the same as /...
  return join(process.env.HOME ?? "", path).replace(/\/\.\//g, "/");
}
