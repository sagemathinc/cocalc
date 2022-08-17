/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import moment from "moment";
import { Moment } from "moment";
import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { StartEndDatesWithStrings } from "@cocalc/util/licenses/purchase/types";

// this does NOT round to start/end of the day.
// take special care if you do this in the front-end, because if server-time is off by a significant amount,
// it might count one day too many or too little.
// use the rounding functions below to fix this, but maybe you have to use the "store/util::useTimeFixer" hook.
export function getDays({ start, end }: StartEndDatesWithStrings): number {
  if (start == null || end == null) {
    throw Error("bug");
  }

  const t0 = new Date(start).valueOf();
  const t1 = new Date(end).valueOf();

  return Math.round((t1 - t0) / ONE_DAY_MS);
}

// round date to start of day (local user time)
export function startOfDay(date: Date | string): Date {
  return moment(date).startOf("day").toDate();
}

// round date to the end of the day (local user time)
export function endOfDay(date: Date | string): Date {
  return moment(date).endOf("day").toDate();
}

// this rounds to the nearest "start" or "end" of a day, either rounded to the very end or start of the day
// this is important when you use a date range selector,
// because e.g. 2022-08-13T23:59:99 is interpreted as the 13th, although (with rounding) it's the 14th
export function roundToMidnight(
  date: Moment | Date | string | undefined,
  side: "start" | "end"
): Date | undefined {
  if (date == null) return date;
  const ts = moment(date).add(12, "hours").startOf("day");
  if (side === "end") {
    // we go back a minute to almost-fully-round to the end of the day.
    // this makes a difference when displaying it for the start/end ranges
    return ts.subtract("1", "minute").endOf("day").toDate();
  } else {
    return ts.toDate();
  }
}
