// See comment in raw-url for the definition.  This is the same, but with "raw" replaced by "download".

import { encodePath } from "./raw-url";
import { join } from "path";
import { basePath } from "./base-path";

export default function downloadURL(
  id: string,
  path: string,
  relativePath: string
): string {
  return `${basePath ?? ""}/download/${id}/${encodePath(join(path, relativePath))}`;
}