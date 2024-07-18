/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { test } from "./shift-subscriptions";
import dayjs from "dayjs";

// Wrap misc.shiftToContainDate in something
// that checks the condition of what that function is
// supposed to do, in case we mess up in defining
// any of the other tests below.
function shiftToContainDate(opts) {
  const end = test.shiftToContainDate(opts);
  // verify that opts.date is in the interval
  if (
    opts.date <= end &&
    opts.date >= dayjs(end).subtract(1, opts.interval).toDate()
  ) {
    return end;
  }
  throw Error(
    `fail -- result does not satisfy condition ${JSON.stringify({
      opts,
      end,
    })}`,
  );
}

describe("shiftToContainDate -- shifts an interval to contain a specified date and end on given day, where interval='month'", () => {
  const interval = "month";
  it("easy month example where no change needed", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-07").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-02-07").toDate());
  });

  it("easy month example where date already contained and just have to shift the day", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-10").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-02-07").toDate());
  });

  it("example where have to shift the month back by one to contain the date", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-07").toDate(),
      interval,
      date: dayjs("2023-01-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-01-07").toDate());
  });

  it("example where have to shift more than a year forward", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2021-01-01").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-02-07").toDate());
  });

  it("example where have to shift more than a year back", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2025-01-01").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-02-07").toDate());
  });

  it(" correct day is in the next month", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-19").toDate(),
      interval,
      date: dayjs("2023-02-02").toDate(),
      day: 1,
    });
    expect(end).toEqual(dayjs("2023-03-01").toDate());
  });

  it("making date during a leap year", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2024-03-19").toDate(),
      interval,
      date: dayjs("2024-02-29").toDate(),
      day: 28,
    });
    expect(end).toEqual(dayjs("2024-03-28").toDate());
  });
});

describe("shiftToContainDate -- shifts an interval to contain a specified date and end on given day, where interval='year'", () => {
  const interval = "year";
  it("easy year example where date already contained and just have to shift the day", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-10").toDate(),
      interval,
      date: dayjs("2023-01-05").toDate(),
      day: 7,
    });
    expect(end).toEqual(dayjs("2023-02-07").toDate());
  });

  it("example involving year interval where have to shift day but not much", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-07").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 11,
    });
    expect(end).toEqual(dayjs("2023-02-11").toDate());
  });

  it("example involving year interval where have to shift day and also significantly move date", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-02-03").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 11,
    });
    expect(end).toEqual(dayjs("2023-02-11").toDate());
  });

  it("example involving year interval where have to shift day but end date is months away from now", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-04-01").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 11,
    });
    expect(end).toEqual(dayjs("2023-04-11").toDate());
  });

  it("example involving year interval where have to shift day AND move the entire interval significantly forward", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2022-04-01").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 11,
    });
    expect(end).toEqual(dayjs("2023-02-11").toDate());
  });

  it("example involving year interval where have to shift day AND move the entire interval significantly back", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2025-04-01").toDate(),
      interval,
      date: dayjs("2023-02-05").toDate(),
      day: 11,
    });
    expect(end).toEqual(dayjs("2023-02-11").toDate());
  });

  it("example involving year interval where have to shift day AND move the entire interval significantly back", () => {
    const end = shiftToContainDate({
      period_end: dayjs("2023-05-01").toDate(),
      interval,
      date: dayjs("2023-02-15").toDate(),
      day: 3,
    });
    expect(end).toEqual(dayjs("2023-05-03").toDate());
  });
});

describe("test some errors are properly raised", () => {
  it("passes in an invalid day bigger than 28", () => {
    expect(() => {
      shiftToContainDate({
        period_end: dayjs("2023-02-07").toDate(),
        interval: "month",
        date: dayjs("2023-02-05").toDate(),
        day: 29,
      });
    }).toThrow("day must be an integer");
  });

  it("passes in an invalid day bigger than 28", () => {
    expect(() => {
      shiftToContainDate({
        period_end: dayjs("2023-02-07").toDate(),
        interval: "month",
        date: dayjs("2023-02-05").toDate(),
        day: 2.5,
      });
    }).toThrow("day must be an integer");
  });

  it("passes in an invalid day bigger than 28", () => {
    expect(() => {
      shiftToContainDate({
        period_end: dayjs("2023-02-07").toDate(),
        interval: "3month" as any,
        date: dayjs("2023-02-05").toDate(),
        day: 2,
      });
    }).toThrow("invalid interval");
  });
});
