import { join } from "path";
import basePath from "lib/base-path";

export function MediaURL(url) {
  if (typeof url != "string") {
    // e.g., a module import destined for the optimized next Image component.
    return url;
  }
  if (url.includes("://")) {
    return url;
  }
  return join(basePath, "doc", url);
}
