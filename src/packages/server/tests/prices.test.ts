/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test produce ID and pricing
// run this in the current directory via
// $ npx jest prices.test.ts  [--watch]

import {
  compute_cost,
  COSTS,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/util";
import { round2 } from "@cocalc/util/misc";
import expect from "expect";
import { getProductId } from "../licenses/purchase/charge";

describe("product id", () => {
  const info1: Omit<PurchaseInfo, "quantity"> = {
    user: "academic",
    upgrade: "custom",
    custom_uptime: "short",
    custom_ram: 1,
    custom_cpu: 1,
    custom_disk: 1,
    custom_member: true,
    subscription: "no",
    start: new Date("2022-04-01 12:00"),
    end: new Date("2022-04-10 12:00"),
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
  };

  it.each([1, 2, 10, 15])("id with quantity %p", (quantity) => {
    const id = getProductId({ ...info1, quantity });
    expect(id).toEqual(`license_a0b0c1d1m1p9r1_v0`);
  });

  it.each([1, 2, 10, 15])("compute price quantity %p", (quantity) => {
    const base = compute_cost({ ...info1, quantity: 1 }).cost;
    const cost = compute_cost({ ...info1, quantity });
    const cexp = round2(base * quantity);
    expect(round2(cost.cost)).toEqual(cexp);
    expect(
      Math.abs(
        round2(cost.discounted_cost) - round2(COSTS.online_discount * cexp)
      )
    ).toBeLessThan(0.01);
  });
});
