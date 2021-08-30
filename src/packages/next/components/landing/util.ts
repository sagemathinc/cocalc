import { join } from "path";
import basePath from "lib/base-path";

export function MediaURL(url: string): string {
  if (url.includes("://")) {
    return url;
  }
  return join(basePath, "doc", url);
}
