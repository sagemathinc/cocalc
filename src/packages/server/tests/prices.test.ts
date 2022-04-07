/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test produce ID and pricing
// run this in the current directory via
// $ npx jest prices.test.ts  [--watch]

import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import {
  compute_cost,
  COSTS,
  money,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/util";
import { round2 } from "@cocalc/util/misc";
import expect from "expect";
import { getProductId, unitAmount } from "../licenses/purchase/charge";

describe("product id and compute cost", () => {
  const info1: Omit<PurchaseInfo, "quantity"> = {
    user: "academic",
    upgrade: "custom",
    custom_uptime: "short",
    custom_ram: 1,
    custom_cpu: 1,
    custom_disk: 1,
    custom_member: true,
    subscription: "no",
    start: new Date("2022-04-28 12:00"),
    end: new Date("2022-05-07 12:00"),
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
  } as const;

  it.each([1, 2, 10, 15])("id with quantity %p", (quantity) => {
    const id = getProductId({ ...info1, quantity });
    expect(id).toEqual(`license_a0b0c1d1m1p9r1_v1`);
  });

  it.each([1, 2, 10, 15])("compute price quantity %p", (quantity) => {
    const base = compute_cost({ ...info1, quantity: 1 }).cost_cents;
    const cost = compute_cost({ ...info1, quantity });
    const cexp = round2(base * quantity);
    expect(round2(cost.cost_cents)).toEqual(cexp);
    expect(
      Math.abs(
        round2(cost.discounted_cost_cents) - round2(COSTS.online_discount * cexp)
      )
    ).toBeLessThan(0.01);
  });

  it.each([
    [1, 13333, 1],
    [2, 13333, 10],
    [3, 13333, 10], // the point is, unit price is independent of quantity
    [4, 13333, 50],
    [5, 13333, 100],
    [6, 13333, 5],
    [7, 13333, 100],
    [8, 13333, 5],
    [9, 13430, 10],
    [10, 14900, 1],
    [15, 22400, 1],
  ])("compute price days %p → price %p", (days, price, quantity) => {
    price /= 100;
    const info2 = {
      ...info1,
      quantity,
      end: new Date((info1.start as Date).getTime() + days * ONE_DAY_MS),
    };
    info2.cost = compute_cost(info2);
    //console.log(days, info2.cost);
    const unit_amount = unitAmount(info2);
    expect(unit_amount).toEqual(Math.round(price));
    const total_exp = Math.round(price * quantity);
    // this test checks if the displayed amount matches the invoice amount
    // see notes about using "round2" in compute_cost
    expect(money(info2.cost.cost_cents, true)).toEqual(`$${total_exp / 100}`);
  });

  it("specific start/end date", () => {
    const info2 = {
      ...info1,
      quantity: 1,
      start: new Date("2022-04-28T10:08:10.072Z"),
      end: new Date("2022-05-05T10:08:10.072Z"),
    };
    info2.cost = compute_cost(info2);
    expect(unitAmount(info2)).toEqual(133);
  });
});
