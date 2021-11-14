import { encodePath } from "./raw-url";
import { join } from "path";

export default function shareURL(
  id: string,
  relativePath: string = ""
): string {
  // do NOT need base path since this is a link from the next server into itself.
  return join("/share", "public_paths", id, encodePath(relativePath));
}
