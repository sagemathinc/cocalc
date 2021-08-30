import { join } from "path";
import basePath from "lib/base-path";

export function ImageURL(url: string): string {
  if (url.includes("://")) {
    return url;
  }
  return join(basePath, "doc", url);
}
