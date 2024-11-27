import { join } from "path";

import { COLORS } from "@cocalc/util/theme";
import { CSS } from "components/misc";
import basePath from "lib/base-path";

export function MediaURL(url) {
  if (typeof url != "string") {
    // e.g., a module import destined for the optimized next Image component.
    return url;
  }
  if (url.includes("://")) {
    return url;
  }
  return join(basePath, url);
}

// slight shadow with rounded corners
export const SHADOW: CSS = {
  boxShadow: "2px 2px 4px rgb(0 0 0 / 25%), 0 2px 4px rgb(0 0 0 / 22%)",
  border: `1px solid ${COLORS.GRAY_LL}`,
  borderRadius: "5px",
} as const;
