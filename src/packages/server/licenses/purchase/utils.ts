import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";

export function getDays({
  start,
  end,
}: Pick<PurchaseInfo, "start" | "end">): number {
  if (start == null || end == null) {
    throw Error("bug");
  }

  const t0 = timestamp(start);
  const t1 = timestamp(end);

  return Math.round(1 + (t1 - t0) / ONE_DAY_MS);
}

// round date to start of day
function timestamp(date: Date | string): number {
  const d = new Date(date);
  return d.valueOf();
}

// round date to start of day
export function startOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setUTCHours(0);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

// round date to the end of the day
export function endOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setUTCHours(23);
  d.setMinutes(59);
  d.setSeconds(59);
  d.setMilliseconds(999);
  return d;
}
