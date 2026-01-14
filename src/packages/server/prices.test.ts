/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// test product ID and pricing

import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { compute_cost } from "@cocalc/util/purchases/quota/compute-cost";
import { round2 } from "@cocalc/util/misc";
import {
  endOfDay,
  startOfDay,
  roundToMidnight,
} from "@cocalc/util/stripe/timecalcs";
import expect from "expect";
import { unitAmount } from "./licenses/purchase/charge";
import { COSTS } from "@cocalc/util/purchases/quota/consts";

// TODO: some tests are ignored if the machine is not running on UTC.
// Ideally, this is taken into account, but that's not implemented.
const isUTC = new Date().getTimezoneOffset() === 0;

describe("product id and compute cost", () => {
  // This test I think hardcodes that the online_discount is 0.75, so
  // (since it isn't!) we set it back to run this test.
  // @ts-ignore
  COSTS.online_discount = 0.75;
  const info1 = {
    version: "1",
    type: "quota",
    user: "academic",
    upgrade: "custom",
    custom_uptime: "short",
    custom_ram: 1,
    custom_cpu: 1,
    custom_disk: 1,
    custom_member: true,
    subscription: "no",
    start: startOfDay(new Date("2022-04-28 12:00")),
    end: endOfDay(new Date("2022-05-07 12:00")),
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
  } as const;

  it.each([1, 2, 10, 15])("compute price quantity %p", (quantity) => {
    const base = compute_cost({ ...info1, quantity: 1 }).cost;
    const cost = compute_cost({ ...info1, quantity });
    const cexp = round2(base * quantity);
    expect(round2(cost.cost)).toEqual(cexp);
  });

  it.each([
    [1, 3184, 1],
    [2, 4776, 10],
    [3, 6369, 10], // the point is, unit price is independent of quantity
    [4, 7961, 50],
    [5, 9553, 100],
    [6, 11145, 5],
    [7, 12737, 100],
    [8, 14329, 5],
    [9, 15921, 10],
    [10, 17600, 1],
    [15, 25500, 1],
  ])("compute price days %p → price %p", (days, price, quantity) => {
    price /= 100;
    const info2 = {
      ...info1,
      quantity,
      end: endOfDay(
        new Date((info1.start as Date).getTime() + days * ONE_DAY_MS),
      ),
    };
    // @ts-ignore
    info2.cost = compute_cost(info2);
    // console.log(days, info2, Math.round(info2.cost.cost_per_unit * 10000));
    const unit_amount = unitAmount(info2);

    expect(unit_amount).toEqual(Math.ceil(price));
  });

  it("specific start/end date", () => {
    const info2 = {
      ...info1,
      quantity: 1,
      start: new Date("2022-04-28T10:08:10.072Z"),
      end: new Date("2022-05-05T10:08:10.072Z"),
    };
    // @ts-ignore
    info2.cost = compute_cost(info2);
    expect(unitAmount(info2)).toEqual(112);
  });
});

describe("start/end of day", () => {
  if (!isUTC) return;

  const d = new Date("2022-04-04 14:31:00");
  const s = "2022-04-04 14:31:00";

  it("start", () => {
    expect(startOfDay(d)).toEqual(new Date("2022-04-04 00:00:00.000Z"));
  });

  it("end", () => {
    expect(endOfDay(d)).toEqual(new Date("2022-04-04 23:59:59.999Z"));
  });

  it("start on string", () => {
    expect(startOfDay(s)).toEqual(new Date("2022-04-04 00:00:00.000Z"));
  });

  it("end on string", () => {
    expect(endOfDay(s)).toEqual(new Date("2022-04-04 23:59:59.999Z"));
  });
});

describe("roundToMidnight", () => {
  if (!isUTC) return;

  const am = new Date("2022-04-04 1:01:00");
  const pm = new Date("2022-04-04 14:31:00");

  it("am/side=start", () => {
    expect(roundToMidnight(am, "start")).toEqual(
      new Date("2022-04-04T00:00:00.000Z"),
    );
  });

  it("am/side=end", () => {
    expect(roundToMidnight(am, "end")).toEqual(
      new Date("2022-04-03T23:59:59.999Z"),
    );
  });

  it("pm/side=start", () => {
    expect(roundToMidnight(pm, "start")).toEqual(
      new Date("2022-04-05T00:00:00.000Z"),
    );
  });

  it("pm/side=end", () => {
    expect(roundToMidnight(pm, "end")).toEqual(
      new Date("2022-04-04T23:59:59.999Z"),
    );
  });
});
