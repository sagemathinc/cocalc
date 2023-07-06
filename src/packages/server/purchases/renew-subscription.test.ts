/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test some functions in renew-subscriptions

import { test } from "./renew-subscription";
import dayjs from "dayjs";

describe("whether or not to use fixed cost", () => {
  const now = new Date();
  const month = dayjs(now).add(1, "month").toDate();
  it("uses fix cost when expires is null", () => {
    expect(
      test.useFixedCost({
        activates: now,
        expires: null,
        current_period_end: month,
      })
    ).toBe(true);
  });

  it("does not uses fix cost when activates in future", () => {
    expect(
      test.useFixedCost({
        activates: month,
        expires: null,
        current_period_end: month,
      })
    ).toBe(false);
    expect(
      test.useFixedCost({
        activates: dayjs(now).add(12, "hour").toDate(),
        expires: null,
        current_period_end: month,
      })
    ).toBe(false);
  });

  it("uses fix cost when expires equals current_period_end", () => {
    expect(
      test.useFixedCost({
        activates: now,
        expires: month,
        current_period_end: month,
      })
    ).toBe(true);
  });

  it("uses fix cost when expires is 1.5 days from current_period_end", () => {
    expect(
      test.useFixedCost({
        activates: now,
        expires: dayjs(month).add(1.5, "day").toDate(),
        current_period_end: month,
      })
    ).toBe(true);
    expect(
      test.useFixedCost({
        activates: now,
        expires: dayjs(month).subtract(1.5, "day").toDate(),
        current_period_end: month,
      })
    ).toBe(true);
  });

  it("does not uses fix cost when expire is more than 2 days from current_period_end", () => {
    expect(
      test.useFixedCost({
        activates: month,
        expires: dayjs(month).subtract(3, "day").toDate(),
        current_period_end: month,
      })
    ).toBe(false);
  });
});

describe("adding and subtracting month and year to a date", () => {
  it("adds a month to Feb 2 and gets March 2", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "month")
        .toISOString()
    ).toBe("2023-03-02T00:00:00.000Z");
  });

  it("adds a year to Feb 2 and gets Feb 2 a year later", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString()
    ).toBe("2024-02-02T00:00:00.000Z");
  });

  it("subtracts a month from March 2 and gets Feb 2", () => {
    expect(
      test
        .subtractInterval(new Date("2023-03-02T00:00:00.000Z"), "month")
        .toISOString()
    ).toBe("2023-02-02T00:00:00.000Z");
  });
  it("subtracts a year to Feb 2 and gets Feb 2 a year earlier", () => {
    expect(
      test
        .subtractInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString()
    ).toBe("2022-02-02T00:00:00.000Z");
  });
});
