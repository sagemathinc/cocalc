import moment from "moment";
import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";

// this does NOT rounds start/end of the day. it assumes this is done by the frontend form (using the user's time zone!)
export function getDays({
  start,
  end,
}: Pick<PurchaseInfo, "start" | "end">): number {
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
