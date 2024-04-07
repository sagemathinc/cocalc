import type {
  Period,
  SiteLicenseDescriptionDB,
} from "@cocalc/util/upgrades/shopping";
import type { PurchaseInfo, StartEndDates, Subscription } from "./types";
import type { Date0 } from "@cocalc/util/types/store";
import dayjs from "dayjs";

export default function getPurchaseInfo(
  conf: SiteLicenseDescriptionDB,
  old = false,
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
        ...fixRange(conf.range, conf.period, old),
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
        ...fixRange(conf.range, conf.period, old),
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
        ...fixRange(null, conf.period, old),
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
  old = false,
): StartEndDates {
  if (!old && period != "range") {
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

const active = new Set([
  "4bc5c13e-5677-4705-b492-e23511d2e911",
  "61bc0c56-de6e-4a35-9983-639c2a5b1af9",
  "a747301a-987c-4be7-b4f6-3390358fcd11",
  "ea7eb026-9091-48b9-9a55-6859ca5a4dba",
  "22d2edba-564f-446e-8975-2dac39ed0556",
  "2c0b6c43-cc0b-475f-af02-3784968219e8",
  "3c61c11c-7ae8-413c-bba0-5f2b3f15c8b8",
  "26580598-f267-4cec-8d0d-72429fb4c74c",
  "010d74be-0837-4bdb-830d-5aaaaf22d7bd",
  "3cb74317-083e-4a85-ae1a-e7cb82b3820b",
  "42b36bc3-3ef5-4c7a-aeb2-39566f838734",
  "d1f8ed91-ba06-4de4-a096-901779eba1a6",
]);

export function report() {
  const data = JSON.parse(require("fs").readFileSync("/tmp/data.json"));
  const { compute_cost } = require("./compute-cost");
  const v: any[] = [];
  for (const x of data) {
    if (new Date(x.purchased) <= new Date("2024-01-15")) continue;
    if (!active.has(x.license_id)) continue;
    const correctInfo = getPurchaseInfo(x.description, false);
    const correctCost =
      x.description.run_limit * compute_cost(correctInfo).cost_per_unit;
    const actualInfo = getPurchaseInfo(x.description, true);
    const actualCost =
      x.description.run_limit * compute_cost(actualInfo).cost_per_unit;
    if (Math.abs(actualCost - correctCost) < 10) {
      continue;
    }
    v.push({
      ...x,
      actual: actualCost,
      correct: correctCost,
      sub: `select '${x.license_id}' from subscriptions where metadata#>>'{license_id}'='${x.license_id}' and status='active';`,
    });
  }
  return v;
}
