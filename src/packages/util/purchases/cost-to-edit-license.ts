// See notes in packages/server/purchases/edit-license.ts for how this works.

import { cloneDeep } from "lodash";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { is_integer } from "@cocalc/util/type-checking";
import { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";
import type { Uptime } from "@cocalc/util/consts/site-license";
import { MAX } from "@cocalc/util/licenses/purchase/consts";
import dayjs from "dayjs";

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
  changes: Changes
): { cost: number; modifiedInfo: PurchaseInfo } {
  if (info.type == "vouchers") {
    throw Error("bug -- a license for vouchers makes no sense");
  }
  const originalInfo = cloneDeep(info);
  if (info.subscription) {
    // We set subscription to 'no' for rest of this function since otherwise
    // compute_cost would ignore the start and end dates.
    info = { ...info };
    info.subscription = "no";
  }
  log({ info, changes });

  const now = new Date();
  const recent = dayjs().subtract(5, "minutes").toDate();
  // check constraints on the changes:
  if (changes.start != null) {
    if (info.start <= recent) {
      throw Error(
        "if you are going to change the start date, then the license can't have already started"
      );
    }
    if (changes.end != null) {
      if (changes.start > changes.end) {
        throw Error(
          "if you are changing both the start and end date, then start must be <= than end"
        );
      }
    }
  }
  if (changes.end != null) {
    if (changes.end < recent) {
      throw Error(
        "if you're changing the end date, then you can't change it to be in the past"
      );
    }
    if (changes.start == null && changes.end < info.start) {
      throw Error(
        `you can't change the end date ${changes.end} to be before the start date ${info.start}`
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
          Object.keys(LicenseIdleTimeouts)
        )}`
      );
    }
  }

  const origInfo = cloneDeep(info);
  if (origInfo.start < now) {
    // Change start date to right now, since we're only making a change
    // during future time.
    origInfo.start = now;
  }

  log("editLicense with start date updated:", { origInfo });

  // Make copy of data with modified params.
  const modifiedInfo = cloneDeep(origInfo);
  if (changes.start != null) {
    // @ts-ignore: TODO!
    modifiedInfo.start = changes.start;
  }
  if (changes.end != null) {
    // @ts-ignore: TODO!
    modifiedInfo.end = changes.end;
  }

  if (changes.quantity != null && modifiedInfo.quantity != changes.quantity) {
    assertIsPositiveInteger(changes.quantity, "quantity");
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the quantity of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.quantity = changes.quantity;
  }

  if (changes.custom_ram != null) {
    assertIsPositiveInteger(changes.custom_ram, "custom_ram");
    if (changes.custom_ram > MAX["ram"]) {
      throw Error(`custom_ram must be at most ${MAX["ram"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_ram of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.custom_ram = changes.custom_ram;
  }

  if (changes.custom_cpu != null) {
    assertIsPositiveInteger(changes.custom_cpu, "custom_cpu");
    if (changes.custom_cpu > MAX["cpu"]) {
      throw Error(`custom_ram must be at most ${MAX["ram"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_cpu of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.custom_cpu = changes.custom_cpu;
  }

  if (changes.custom_disk != null) {
    assertIsPositiveInteger(changes.custom_disk, "custom_disk");
    if (changes.custom_disk > MAX["disk"]) {
      throw Error(`custom_ram must be at most ${MAX["disk"]}`);
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_disk of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.custom_disk = changes.custom_disk;
  }

  if (changes.custom_member != null) {
    if (typeof changes.custom_member != "boolean") {
      throw Error("custom_member must be boolean");
    }
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_member of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.custom_member = changes.custom_member;
  }

  if (changes.custom_uptime != null) {
    if (modifiedInfo.type != "quota") {
      throw Error(
        `you can only change the custom_uptime of a quota upgrade license but this license has type '${modifiedInfo.type}'`
      );
    }
    modifiedInfo.custom_uptime = changes.custom_uptime;
  }

  log({ modifiedInfo });

  // Determine price for the change
  const price = compute_cost(origInfo);
  const modifiedPrice = compute_cost(modifiedInfo);
  log({ price });
  log({ modifiedPrice });

  const cost = modifiedPrice.discounted_cost - price.discounted_cost;
  log({ cost });
  // We removed subscription so it didn't impact price calculation.  Now we put it back.
  modifiedInfo.subscription = originalInfo.subscription;
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
