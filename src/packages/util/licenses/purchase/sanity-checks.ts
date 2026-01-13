/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LicenseIdleTimeouts, Uptime } from "@cocalc/util/consts/site-license";
import { isEqual } from "lodash";
import { compute_cost } from "./compute-cost";
import { MAX } from "./consts";
import { PurchaseInfo } from "./types";

// throws an exception if it spots something funny...
export async function sanity_checks(pool, info: PurchaseInfo) {
  void pool;
  const { type } = info;
  if (typeof info != "object") {
    throw Error("must be an object");
  }

  if (type !== "quota") {
    throw new Error(`type must be quota – but got "${type}"`);
  }

  sanity_check_start_end(info);
  sanity_check_quota(info);
  sanity_check_cost(info);
}

// Check that cost in the info object matches computing the cost again
// from scratch.  We *only* do this if a cost is set, since we also
// use this code for creating licenses associated to a voucher, where
// payment has already happened (or will happen later).
function sanity_check_cost(info: PurchaseInfo) {
  if (info.cost != null && !isEqual(info.cost, compute_cost(info))) {
    throw Error("cost does not match");
  }
}

function sanity_check_start_end(info: PurchaseInfo) {
  const { type } = info;

  if (type === "quota" && info.subscription === "no") {
    if (info.start == null) {
      throw Error("must have start date set");
    }
  }

  if (type === "quota") {
    const start = info.start ? new Date(info.start) : undefined;
    const end = info.end ? new Date(info.end) : undefined;

    if (info.subscription == "no") {
      if (start == null || end == null) {
        throw Error(
          "start and end dates must both be given if not a subscription"
        );
      }

      if (end <= start) {
        throw Error("end date must be after start date");
      }
    }
  }
}

function sanity_check_quota(info: PurchaseInfo) {
  const { type } = info;
  if (type !== "quota") return;
  for (const x of ["ram", "cpu", "disk", "dedicated_ram", "dedicated_cpu"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "number") {
      throw Error(`field "${field}" must be number`);
    }
    if (info[field] < 0 || info[field] > MAX[field]) {
      throw Error(`field "${field}" too small or too big`);
    }
  }
  if (info.custom_uptime == null || typeof info.custom_uptime !== "string") {
    throw new Error(`field "custom_uptime" must be set`);
  }

  if (
    LicenseIdleTimeouts[info.custom_uptime] == null &&
    info.custom_uptime != ("always_running" as Uptime)
  ) {
    const tos = Object.keys(LicenseIdleTimeouts).join(", ");
    throw new Error(
      `field "custom_uptime" must be one of ${tos} or "always_running"`
    );
  }

  for (const x of ["member"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "boolean") {
      throw Error(`field "${field}" must be boolean`);
    }
  }
}
