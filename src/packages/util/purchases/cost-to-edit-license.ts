// See notes in packages/server/purchases/edit-license.ts for how this works.

import { cloneDeep } from "lodash";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { is_integer } from "@cocalc/util/type-checking";
import { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";
import type { Uptime } from "@cocalc/util/consts/site-license";
import { MAX } from "@cocalc/util/licenses/purchase/consts";

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

const log = (...args) => console.log("costToEditLicense", ...args);

export default function costToEditLicense(
  info: PurchaseInfo,
  changes: Changes
): { cost: number; modifiedInfo: PurchaseInfo } {
  if (info.type == "vouchers") {
    throw Error("bug -- a license for vouchers makes no sense");
  }
  log({ info, changes });

  const now = new Date();
  // check constraints on the changes:
  if (changes.start != null) {
    if (info.start <= now) {
      throw Error(
        "if you are going to change the start date, then the license can't have already started"
      );
    }
    if (changes.end != null) {
      if (changes.start >= changes.end) {
        throw Error(
          "if you are changing both the start and end date, then start must be less than end"
        );
      }
    }
  }
  if (changes.end != null) {
    if (changes.end < now) {
      throw Error(
        "if you're changing the end date, then you can't change it to be in the past"
      );
    }
    if (changes.start == null && changes.end <= info.start) {
      throw Error("you can't change the end date to be before the start date");
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
