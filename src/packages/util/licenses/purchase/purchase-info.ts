import type { SiteLicenseDescriptionDB } from "@cocalc/util/upgrades/shopping";
import type { PurchaseInfo, Subscription } from "./types";
import type { Date0 } from "@cocalc/util/types/store";

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
      const rangeQuota = fixRange(conf.range);
      return {
        type, // "quota"
        user,
        upgrade: "custom" as "custom",
        quantity: run_limit,
        subscription: (period == "range" ? "no" : period) as Subscription,
        start: rangeQuota[0],
        end: rangeQuota[1],
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
      if (conf.range[0] == null || conf.range[1] == null) {
        throw new Error(
          `start/end range must be defined -- range=${JSON.stringify(
            conf.range
          )}`
        );
      }
      const rangeVM = fixRange(conf.range);
      return {
        type: "vm",
        quantity: 1,
        dedicated_vm: conf.dedicated_vm,
        subscription: "no",
        start: rangeVM[0],
        end: rangeVM[1],
        title,
        description,
      };

    case "disk":
      return {
        type: "disk",
        quantity: 1,
        dedicated_disk: conf.dedicated_disk,
        subscription: conf.period,
        start: new Date(),
        title,
        description,
      };
  }
}

// make sure start/end is properly defined
// later, when actually saving the range to the database, we will maybe append a portion of the start which is in the past
function fixRange(rangeOrig?: [Date0 | string, Date0 | string]): [Date, Date0] {
  if (rangeOrig == null) {
    return [new Date(), undefined];
  }

  const [start, end]: [Date, Date0] = [
    rangeOrig?.[0] ? new Date(rangeOrig?.[0]) : new Date(),
    rangeOrig?.[1] ? new Date(rangeOrig?.[1]) : undefined,
  ];

  return [start, end];
}
