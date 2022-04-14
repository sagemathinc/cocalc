import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { endOfDay, getDays, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { LicenseType } from "./add-box";
import { DateRange } from "./site-license-cost";

// site license type
export function getType(item): LicenseType {
  const descr = item.description;
  if (descr.dedicated_disk != null && descr.dedicated_disk !== false) {
    return "disk";
  } else if (descr.dedicated_vm != null && descr.dedicated_vm !== false) {
    return "vm";
  } else if (descr.boost === true) {
    return "boost";
  } else {
    return "regular";
  }
}

// when loading an item from the cart/saved for later, we have to fix the start/end dates to be at least "today" at the start of the day in the users time zone.
export function loadDateRange(range?: DateRange): DateRange {
  if (range == null) {
    const now = new Date();
    return [startOfDay(now), endOfDay(now)];
  }

  for (const idx of [0, 1]) {
    const v = range[idx];
    if (typeof v === "string") {
      range[idx] = new Date(v);
    }
  }

  if (range[0] instanceof Date) {
    const today = startOfDay(new Date());
    const prevStart = range[0];

    if (range[0].getTime() < today.getTime()) {
      range[0] = today;
    }

    // we we have to shift the start, move the end forward as well and preserve the duration.
    if (range[1] instanceof Date) {
      if (range[0].getTime() > range[1].getTime()) {
        const days = getDays({ start: prevStart, end: range[1] });
        range[1] = endOfDay(new Date(Date.now() + ONE_DAY_MS * days));
      }
    }
  }
  return range;
}
