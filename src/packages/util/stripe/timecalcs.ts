/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// take special care if you do this in the front-end, because if server-time is off by a significant amount,
// it might count one day too many or too little.
// use the rounding functions below to fix this, but maybe you have to use the "store/util::useTimeFixer" hook.

import { DateRangeOptional } from "@cocalc/util/types/store";
import dayjs, { Dayjs } from "dayjs";

// this does NOT round to start/end of the day.

export function getDays({ start, end }): number {
  if (start == null || end == null) {
    throw Error("bug");
  }
  return dayjs(end).diff(dayjs(start), "day", true);
}

// round date to start of day (local user time)
export function startOfDay(date: Date | string): Date {
  return dayjs(date).startOf("day").toDate();
}

// round date to the end of the day (local user time)
export function endOfDay(date: Date | string): Date {
  return dayjs(date).endOf("day").toDate();
}

// this rounds to the nearest "start" or "end" of a day, either rounded to the very end or start of the day
// this is important when you use a date range selector,
// because e.g. 2022-08-13T23:59:99 is interpreted as the 13th, although (with rounding) it's the 14th
export function roundToMidnight(
  date: Dayjs | Date | string | undefined,
  side: "start" | "end",
): Date | undefined {
  if (date == null) return date;
  const ts = dayjs(date).add(12, "hours").startOf("day");
  if (side === "end") {
    // we go back a minute to almost-fully-round to the end of the day.
    // this makes a difference when displaying it for the start/end ranges
    return ts.subtract(1, "minute").endOf("day").toDate();
  } else {
    return ts.toDate();
  }
}

/**
 * We modify dates in favor of the user for range license purchase using this function.
 * In particular, if the start date is before the current time,
 * which happens when you order something that is supposed to start "now" (and is
 * corrected to the start of the day in the user's time zone),
 * then append that period that's already in the past to the end of the range,
 * to avoid changing the price (which would be confusing).
 */
export function adjustDateRangeEndOnSameDay([
  start,
  end,
]: DateRangeOptional): DateRangeOptional {
  if (start == null || end == null) {
    return [start, end];
  }
  const now = new Date();
  // we don't care about changing start, because it's already in the past
  end = appendAfterNowToDate({ now, start, end });
  return [start, end];
}

export function appendAfterNowToDate({
  now,
  start,
  end,
}: {
  now: Date;
  start: Date;
  end: Date;
}): Date {
  if (start < now) {
    const diff = now.getTime() - start.getTime();
    return new Date(end.getTime() + diff);
  } else {
    return end;
  }
}

export function hoursInInterval(interval: "month" | "year"): number {
  if (interval.startsWith("month")) {
    return 730;
  } else if (interval.startsWith("year")) {
    return 8760;
  } else {
    throw Error("bug");
  }
}
