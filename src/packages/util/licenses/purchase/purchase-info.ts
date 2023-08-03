import type {
  Period,
  SiteLicenseDescriptionDB,
} from "@cocalc/util/upgrades/shopping";
import type { PurchaseInfo, StartEndDates, Subscription } from "./types";
import type { Date0 } from "@cocalc/util/types/store";
import dayjs from "dayjs";

export default function getPurchaseInfo(
  conf: SiteLicenseDescriptionDB
): PurchaseInfo {
  conf.type = conf.type ?? "quota"; // backwards compatibility

  const { title, description } = conf;

  switch (conf.type) {
    case "quota":
      const {
        type,
        user,
        run_limit,
        period,
        ram,
        cpu,
        disk,
        member,
        uptime,
        boost = false,
      } = conf;
      return {
        type, // "quota"
        user,
        upgrade: "custom" as "custom",
        quantity: run_limit,
        subscription: (period == "range" ? "no" : period) as Subscription,
        ...fixRange(conf.range, conf.period),
        custom_ram: ram,
        custom_dedicated_ram: 0,
        custom_cpu: cpu,
        custom_dedicated_cpu: 0,
        custom_disk: disk,
        custom_member: member,
        custom_uptime: uptime,
        boost,
        title,
        description,
      };

    case "vm":
      return {
        type: "vm",
        quantity: 1,
        dedicated_vm: conf.dedicated_vm,
        subscription: "no",
        ...fixRange(conf.range, conf.period),
        title,
        description,
      };

    case "disk":
      return {
        type: "disk",
        quantity: 1,
        dedicated_disk: conf.dedicated_disk,
        subscription: conf.period,
        title,
        description,
        ...fixRange(null, conf.period),
      };
  }
}

// Make sure both start and end dates defined as Date.  For all licenses we
// always require that both are defined.  For a subscription, the end date must
// be defined, but it will get periodically moved forward as the subscription
// is updated.
// Later, when actually saving the range to the database, we will maybe append
// a portion of the start which is in the past.
export function fixRange(
  rangeOrig: readonly [Date0 | string, Date0 | string] | undefined | null,
  period: Period
): StartEndDates {
  const now = new Date();
  if (rangeOrig == null) {
    if (period == "range") {
      throw Error(
        "if period is 'range', then start and end dates must be explicitly given"
      );
    }
    return { start: now, end: addPeriod(now, period) };
  }

  return {
    start: rangeOrig?.[0] ? new Date(rangeOrig?.[0]) : now,
    end: rangeOrig?.[1] ? new Date(rangeOrig?.[1]) : addPeriod(now, period),
  };
}

function addPeriod(date: Date, period: Period): Date {
  if (period == "range") {
    throw Error("period must not be range");
  } else if (period == "monthly") {
    return dayjs(date).add(1, "month").toDate();
  } else if (period == "yearly") {
    return dayjs(date).add(1, "year").toDate();
  } else {
    throw Error(`unsupported period ${period}`);
  }
}
