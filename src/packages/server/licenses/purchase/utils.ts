import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";

export function getDays({
  start,
  end,
}: Pick<PurchaseInfo, "start" | "end">): number {
  if (
    start == null ||
    typeof start === "string" ||
    end == null ||
    typeof end == "string"
  ) {
    throw Error("bug");
  }

  const t0 = startOfDay(start).valueOf();
  const t1 = startOfDay(end).valueOf();

  return Math.round(1 + (t1 - t0) / ONE_DAY_MS);
}

// round date to start of day
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
