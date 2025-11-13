// See notes in packages/server/purchases/edit-license.ts for how this works.

import { cloneDeep } from "lodash";
import dayjs from "dayjs";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { is_integer } from "@cocalc/util/type-checking";
import { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";
import type { Uptime } from "@cocalc/util/consts/site-license";
import { MAX } from "@cocalc/util/licenses/purchase/consts";
import { round2up } from "../misc";
import { CURRENT_VERSION } from "@cocalc/util/licenses/purchase/consts";

export interface Changes {
  end?: Date;
  start?: Date;
  quantity?: number;
  custom_ram?: number;
  custom_disk?: number;
  custom_cpu?: number; // positive integer
  custom_member?: boolean;
  custom_uptime?: Uptime; // short, medium, day, always_running
}

//const log = (...args) => console.log("costToEditLicense", ...args);
const log = (..._args) => {};

export default function costToEditLicense(
  info: PurchaseInfo,
  changes: Changes,
  now: Date = new Date(),
): { cost: number; modifiedInfo: PurchaseInfo } {
  if (info.type != "quota") {
    throw Error(
      `bug -- editing a license of type "${info.type}" is not currently supported`,
    );
  }
  const originalInfo = cloneDeep(info);
  log({ info, changes });
  if (info.start == null) {
    throw Error("start must be set");
  }
  if (info.end == null) {
    throw Error("end must be set");
  }

  const recent = dayjs(now).subtract(5, "minutes").toDate();
  // check constraints on the changes:
  if (changes.start != null) {
    if (info.start <= recent) {
      throw Error(
        "if you are going to change the start date, then the license can't have already started",
      );
    }
    if (changes.end != null) {
      if (changes.start > changes.end) {
        throw Error(
          "if you are changing both the start and end date, then start must be <= than end",
        );
      }
    }
  }
  if (changes.end != null) {
    if (changes.end < recent) {
      throw Error(
        "if you're changing the end date, then you can't change it to be in the past",
      );
    }
    if (changes.start == null && changes.end < info.start) {
      throw Error(
        `you can't change the end date ${changes.end} to be before the start date ${info.start}`,
      );
    }
  }

  if (changes.custom_uptime != null) {
    if (
      LicenseIdleTimeouts[changes.custom_uptime] == null &&
      changes.custom_uptime != "always_running"
    ) {
      throw Error(
        `custom_uptime must be 'always_running' or one of ${JSON.stringify(
          Object.keys(LicenseIdleTimeouts),
        )}`,
      );
    }
  }

  const origInfo = cloneDeep(info);
  if (origInfo.start == null) {
    throw Error("start must be set");
  }
  if (origInfo.end == null) {
    throw Error("end must be set");
  }
  if (origInfo.start < now) {
    // Change start date to right now, since we're only making a change
    // during future time.
    origInfo.start = now;
  }
  if (origInfo.end < origInfo.start) {
    origInfo.end = origInfo.start;
  }

  log("editLicense with start date updated:", { origInfo });

  // Make copy of data with modified params.
  // modifiedInfo uses the current default pricing algorithm, since that the cost today
  // to make this purchase, hence changing version below.
  const modifiedInfo = { ...cloneDeep(origInfo), version: CURRENT_VERSION };
  if (changes.start != null) {
    modifiedInfo.start = changes.start;
  }
  if (changes.end != null) {
    modifiedInfo.end = changes.end;
  }

  if (modifiedInfo.start == null) {
    throw Error("start must be set");
  }
  if (modifiedInfo.end == null) {
    throw Error("end must be set");
  }
  if (modifiedInfo.start < now) {
    // Change start date to right now, since we're only making a change
    // during future time.
    modifiedInfo.start = now;
  }
  if (modifiedInfo.end < modifiedInfo.start) {
    modifiedInfo.end = modifiedInfo.start;
  }

  let numChanges = 0;
  if (changes.quantity != null && modifiedInfo.quantity != changes.quantity) {
    assertIsPositiveInteger(changes.quantity, "quantity");
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the quantity of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.quantity = changes.quantity;
  }

  if (
    changes.custom_ram != null &&
    modifiedInfo.custom_ram != changes.custom_ram
  ) {
    assertIsPositiveInteger(changes.custom_ram, "custom_ram");
    if (changes.custom_ram > MAX["ram"]) {
      throw Error(`custom_ram must be at most ${MAX["ram"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_ram of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.custom_ram = changes.custom_ram;
  }

  if (
    changes.custom_cpu != null &&
    modifiedInfo.custom_cpu != changes.custom_cpu
  ) {
    assertIsPositiveInteger(changes.custom_cpu, "custom_cpu");
    if (changes.custom_cpu > MAX["cpu"]) {
      throw Error(`custom_ram must be at most ${MAX["ram"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_cpu of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.custom_cpu = changes.custom_cpu;
  }

  if (
    changes.custom_disk != null &&
    modifiedInfo.custom_disk != changes.custom_disk
  ) {
    assertIsPositiveInteger(changes.custom_disk, "custom_disk");
    if (changes.custom_disk > MAX["disk"]) {
      throw Error(`custom_ram must be at most ${MAX["disk"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_disk of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.custom_disk = changes.custom_disk;
  }

  if (
    changes.custom_member != null &&
    !!modifiedInfo.custom_member != !!changes.custom_member
  ) {
    if (typeof changes.custom_member != "boolean") {
      throw Error("custom_member must be boolean");
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_member of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.custom_member = changes.custom_member;
  }

  if (
    changes.custom_uptime != null &&
    modifiedInfo.custom_uptime != changes.custom_uptime
  ) {
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_uptime of a quota upgrade license but this license has type '${modifiedInfo.type}'`,
      );
    }
    numChanges += 1;
    modifiedInfo.custom_uptime = changes.custom_uptime;
  }

  log({ modifiedInfo });

  // Determine price for the change

  // the value of the license the user currently owned.  The pricing algorithm version is important here.
  const currentValue = currentLicenseValue(origInfo);

  if (numChanges > 0 && modifiedInfo.type == "quota") {
    // Delete modifiedInfo.cost_per_hour, since that would be the current
    // rate, and also it is completely wrong since it does not take into
    // account any of the changes!  Also, it's impossible in general to
    // account for changing all params (e.g., quantity is easy, but others are hard).
    // Also, we want to force computation of the current going rate, not
    // the old rate.
    delete modifiedInfo.cost_per_hour;
  }

  // Determine price for the modified license they would like to switch to.
  // modifiedInfo uses the current default pricing algorithm, since that the cost today
  // to make this purchase, hence changing version below.
  const modifiedValue = currentLicenseValue(modifiedInfo);
  // cost can be negative, when we give user a refund.
  // **We round away from zero!**  The reason is because
  // if the user cancels a subscription for a refund and
  // gets $X, then buys that same subscription again, we
  // want the price to again be $X, and not $X+0.01, which
  // could be really annoying and block the purchase.
  const d = modifiedValue - currentValue;
  const cost = (d < 0 ? -1 : 1) * round2up(Math.abs(d));
  log({
    cost,
    currentValue,
    modifiedValue,
    origInfo,
    changes,
    modifiedInfo,
  });
  // In case of a subscription, we changed start to correctly compute the cost
  // of the change.  Set it back:
  if (modifiedInfo.subscription != "no") {
    modifiedInfo.start = originalInfo.start;
  }
  return { cost, modifiedInfo };
}

function assertIsPositiveInteger(n: number, desc: string) {
  if (!is_integer(n)) {
    throw Error(`${desc} must be an integer`);
  }
  if (n <= 0) {
    throw Error(`${desc} must be positive`);
  }
}

// this function assumes now <= start <= end!
function currentLicenseValue(info: PurchaseInfo): number {
  if (info.type !== "quota") {
    // We do not provide any prorated refund for ancient license types.
    return 0;
  }
  if (info.end == null || info.start == null) {
    // infinite value?
    return 0;
  }

  // Depending on cost_per_hour being set properly is a nightmare -- it can
  // be very subtly wrong or have rounding issues, and this can expose us to abuse.
  // Instead for NOW we are using the current value of the license.
  // However, we never change our costs.  When we do, we should
  // keep our old cost params and use it to compute the value of the
  // license, based on the date when it was last purchased.
  // Perhaps we won't raise rates before switching to a full
  // pay as you go model....

  //   if (info.cost_per_hour) {
  //     // if this is set, we use it to compute the value
  //     // The value is cost_per_hour times the number of hours left until info.end.
  //     const end = dayjs(info.end);
  //     const start = dayjs(info.start);
  //     const hoursRemaining = end.diff(start, "hours", true);
  //     // the hoursRemaining can easily be *negative* if info.end is
  //     // in the past.
  //     // However the value of a license is never negative, so we max with 0.
  //     return Math.max(0, hoursRemaining * info.cost_per_hour);
  //   }

  // Compute value using the current rate.
  // As mentioned above, we can keep old rates if/when we change the rate,
  // and compute costs for refunds using that, when applicable.
  const price = compute_cost(info);
  return price.cost;
}
