/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { LicenseIdleTimeoutsKeysOrdered } from "@cocalc/util/consts/site-license";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { getDays } from "@cocalc/util/stripe/timecalcs";
import { getDedicatedDiskKey, PRICES } from "@cocalc/util/upgrades/dedicated";

// When we change pricing, the products in stripe will already
// exist with old prices (often grandfathered) so we may want to
// instead change the version so new products get created
// automatically.
// 20220406: version "1" after discovering an unintentional volume discount,
//           skewing the unit price per "product" in stripe.
// 20220425: keeping version "1" when introducing "boost" (appending an uppercase "B")
//           and dedicated resources (they are explicitly listed and define their own "stripeID")
//           i.e. starting with "dVW" or "dD", which is distinct from starting with "a[idle]"
const VERSION = 1;

export function getProductId(info: PurchaseInfo): string {
  /* We generate a unique identifier that represents the parameters of the purchase.
     The following parameters determine what "product" they are purchasing:
        - custom_uptime (until 2022-02: custom_always_running)
        - custom_cpu
        - custom_dedicated_cpu
        - custom_disk
        - custom_member
        - custom_ram
        - custom_dedicated_ram
        - period: subscription or set number of days
      We encode these in a string which serves to identify the product.
  */

  function period(): string {
    if (info.type === "disk") throw new Error("disk do not have a period");

    if (info.subscription == "no") {
      return getDays(info).toString();
    } else {
      return "0"; // 0 means "subscription" -- same product for all types of subscription billing;
    }
  }

  // this is backwards compatible: short: 0, always_running: 1, ...
  function idleTimeout(): number {
    if (info.type !== "quota") throw new Error("idle_timeout only for quota");
    switch (info.custom_uptime) {
      case "short":
        return 0;
      case "always_running":
        return 1;
      default:
        return 1 + LicenseIdleTimeoutsKeysOrdered.indexOf(info.custom_uptime);
    }
  }

  const type = info.type;
  const pid = [`license_`];

  switch (type) {
    case "quota":
      pid.push(
        ...[
          `a${idleTimeout()}`,
          `b${info.user == "business" ? 1 : 0}`,
          `c${info.custom_cpu}`,
          `d${info.custom_disk}`,
          `m${info.custom_member ? 1 : 0}`,
          `p${period()}`,
          `r${info.custom_ram}`,
        ]
      );
      if (info.custom_dedicated_ram) {
        pid.push(`y${info.custom_dedicated_ram}`);
      }
      if (info.custom_dedicated_cpu) {
        pid.push(`z${Math.round(10 * info.custom_dedicated_cpu)}`);
      }
      // boost licenses have the same price as corresponding regular licenses, but their user visible title/description is different!
      if (info.boost === true) {
        pid.push("B");
      }
      break;

    // this makes also sure to only purchase a known disk (nothing made up)
    case "disk":
      if (typeof info.dedicated_disk === "boolean") {
        throw new Error(`didicated_disk configuration must be an object!`);
      }
      const disk = PRICES.disks[getDedicatedDiskKey(info.dedicated_disk)];
      if (disk == null) {
        throw new Error("no disk found – should never happen!");
      }
      pid.push(disk.stripeID);
      break;

    // we make sure only known VMs can be bought (and later we check if the price matches as well)
    case "vm":
      const vm = PRICES.vms[info.dedicated_vm.machine];
      if (vm == null) {
        throw new Error(`VM of type ${info.dedicated_vm.machine} not found`);
      }
      pid.push(vm.stripeID);
      break;

    default:
      throw new Error(`Product ID: unknown type ${type}`);
  }

  pid.push(`_v${VERSION}`);
  return pid.join("");
}
