/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { endOfDay, getDays, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { DateRange } from "@cocalc/util/upgrades/shopping";
import useCustomize from "lib/use-customize";
import { useMemo } from "react";

import { LicenseTypeInForms } from "./add-box";

// site license type in a form, we have 4 forms hence 4 types
// later, this will be mapped to just "LicenseType", where boost and regular
// are "quota" and item.boost = true|false.
export function getType(item): LicenseTypeInForms {
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

/**
 * use serverTime to fix the users exact time and return an object with these properties:
 * - offset: difference in milliseconds between server time and user time
 * - timezone: the user's timezone
 * - serverTime: the Date object of serverTime
 * - userTime: the Date object of userTime
 * - function toServerTime(date): converts a Date object from the user's time to the server time
 *
 * @param serverTime -- milliseconds since epoch from the server
 */
export function useTimeFixer() {
  return useMemo(() => {
    // server time is supposed to be always set, but just in case …
    const { serverTime: customizeServerTime } = useCustomize();
    if (customizeServerTime == null) {
      console.warn(
        "WARNING: customize.serverTime is not set, using Date.now()"
      );
    }
    const serverTime = customizeServerTime ?? Date.now();

    // important: useMemo, b/c we calculate the offset only *once* when the page loads, not each time the hook is called
    const offset = Date.now() - serverTime;
    return {
      offset,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      serverTimeDate: new Date(serverTime),
      toServerTime: (date: Date) => new Date(date.getTime() - offset),
    };
  }, []);
}
