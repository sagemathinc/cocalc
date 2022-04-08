import moment from "moment";
import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";

// this rounds start to the start of the day, and end to the end of the day
export function getDays({
  start,
  end,
}: Pick<PurchaseInfo, "start" | "end">): number {
  if (start == null || end == null) {
    throw Error("bug");
  }

  const t0 = startOfDay(start).valueOf();
  const t1 = endOfDay(end).valueOf();

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
