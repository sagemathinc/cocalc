import dayjs from "dayjs";

import type { Date0 } from "@cocalc/util/types/store";
import type {
  Period,
  SiteLicenseDescriptionDB,
} from "@cocalc/util/upgrades/shopping";
import { CURRENT_VERSION } from "./consts";
import type { PurchaseInfo, StartEndDates, Subscription } from "./types";

// this ALWAYS returns purchaseInfo that is the *current* version.
export default function getPurchaseInfo(
  conf: SiteLicenseDescriptionDB,
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
        source,
        boost = false,
      } = conf;
      return {
        version: CURRENT_VERSION,
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
        source,
      };

    case "vm":
      return {
        version: CURRENT_VERSION,
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
        version: CURRENT_VERSION,
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
  period: Period,
  noRangeShift?: boolean,
): StartEndDates {
  if (period != "range" && !noRangeShift) {
    // ATTN! -- we messed up and didn't deal with this case before, and a user
    // could in theory:
    //  1. set the period to 'range', and put in a week period via start and end
    //  2. set the period to 'yearly'.
    // Then rangeOrig is still a week, so they pay for one week instead of one year!
    // Instead, in whenever the period is 'monthly' or 'yearly' (anything but 'range',
    // we unset rangeOrig here so we use start=now and end=now + a year (say) for
    // the price computation.
    rangeOrig = null;
  }
  const now = new Date();
  if (rangeOrig == null) {
    if (period == "range") {
      throw Error(
        "if period is 'range', then start and end dates must be explicitly given",
      );
    }
    // we expand the dates to be as inclusive as possible for subscriptions, since
    // that doesn't result in any more charge to the user.
    return {
      start: dayjs(now).startOf("day").toDate(),
      end: dayjs(addPeriod(now, period)).endOf("day").toDate(),
    };
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
