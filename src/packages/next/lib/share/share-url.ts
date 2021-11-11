import { encodePath } from "./raw-url";
import { join } from "path";
import basePath from "lib/base-path";

export default function shareURL(
  id: string,
  relativePath: string = ""
): string {
  return join(basePath, "share", "public_paths", id, encodePath(relativePath));
}
