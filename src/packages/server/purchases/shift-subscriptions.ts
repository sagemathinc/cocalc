/*
Code related to shifting the current_period_end of subscriptions to end
on a specific day of the month, to align with statements and automatic
billing.
*/

import type { PoolClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type {
  Interval,
  Subscription,
} from "@cocalc/util/db-schema/subscriptions";
import dayjs from "dayjs";
import { nextDateWithDay, prevDateWithDay } from "./closing-date";
import editLicense from "./edit-license";

const logger = getLogger("purchase:shift-subscriptions");

export default async function shiftAllSubscriptionsToEndOnDay(
  account_id: string,
  day: number,
  client: PoolClient
) {
  logger.debug("shiftAllSubscriptionsToEndOnDay", { account_id, day });
  if (day < 1 || day > 28) {
    logger.debug("shiftAllSubscriptionsToEndOnDay -- invalid day");
    throw Error(`day (=${day}) must be between 1 and 28, inclusive`);
  }

  let query =
    "SELECT id, interval, current_period_start, current_period_end, status, metadata FROM subscriptions WHERE account_id=$1";
  const { rows } = await client.query(query, [account_id]);
  logger.debug(
    "shiftAllSubscriptionsToEndOnDay -- considering ",
    rows.length,
    " subscriptions"
  );
  if (rows.length == 0) {
    // easy special case...
    return;
  }
  for (const row of rows) {
    await shiftSubscriptionToEndOnDay(account_id, row, day, client);
  }
}

async function shiftSubscriptionToEndOnDay(
  account_id: string,
  sub: Pick<
    Subscription,
    "id" | "interval" | "current_period_end" | "status" | "metadata"
  >,
  day: number,
  client: PoolClient
) {
  const curEndDay = sub.current_period_end.getDate();
  if (curEndDay == day) {
    // it already ends on the right day, so nothing to do.
    return;
  }
  /*
  Adjust current_period_start and current_period_end to both
  be on the target day, subject to:

  - right now must be contained in the period, i.e., current_period_start <= now <= current_period_end, and
  - shift the interval by the minimum number of days
  */
  // Step 1: shift current_period_start and current_period_end over by interval until they contain now.
  // If subscription was active and being properly maintained this should already be the case, but maybe
  // it isn't active, etc.
  const current_period_end = shiftToContainDate({
    period_end: sub.current_period_end,
    interval: sub.interval,
    date: new Date(),
    day,
  });
  const current_period_start = dayjs(current_period_end)
    .subtract(1, sub.interval)
    .toDate();
  if (
    Math.abs(sub.current_period_end.valueOf() - current_period_end.valueOf()) >
    1000 * 60
  ) {
    await client.query(
      "UPDATE subscriptions SET current_period_start=$1, current_period_end=$2 WHERE id=$3",
      [current_period_start, current_period_end, sub.id]
    );

    if (sub.status != "canceled") {
      // change underlying license end date to match (could result in credit or charge)
      if (sub.metadata?.type == "license") {
        await editLicense({
          account_id,
          license_id: sub.metadata.license_id,
          changes: { end: current_period_end },
          note: "Edit to this license due to modifying the current period end of the subscription.",
          isSubscriptionRenewal: true,
          client,
          force: true,
        });
      }
    }
  }
}

function shiftToContainDate({
  period_end,
  interval,
  date,
  day,
}: {
  period_end: Date;
  interval: Interval;
  date: Date;
  day: number; // 1-28 -- a day of the month
}): Date {
  if (day < 1 || day > 28 || !Number.isInteger(day)) {
    throw Error("day must be an integer between 1 and 28, inclusive");
  }
  let end = dayjs(period_end);

  const end_day = end.date();
  if (end_day != day) {
    // shift end to be on give day.
    // find next and previous date with correct day, see which is closer to period_end, and use it.
    const next = dayjs(nextDateWithDay(period_end, day));
    const prev = dayjs(prevDateWithDay(period_end, day));
    if (Math.abs(next.diff(period_end)) > Math.abs(prev.diff(period_end))) {
      // next is further so we take prev
      end = prev;
    } else {
      // next is closer so we take next
      end = next;
    }
  }
  const target = dayjs(date);
  if (interval == "month") {
    // shift by the right number of months so that target is in
    // the interval [end-month, end]:
    return end
      .subtract(Math.floor(end.diff(target, "month", true)), "month")
      .toDate();
  } else if (interval == "year") {
    let start = end.subtract(1, "year");
    if (
      (target.isSame(start) || target.isAfter(start)) &&
      (target.isSame(end) || target.isBefore(end))
    ) {
      return end.toDate();
    }
    if (Math.abs(start.diff(target)) < Math.abs(end.diff(target))) {
      // start is closer
      return start
        .subtract(Math.floor(start.diff(target, "month", true)), "month")
        .toDate();
    } else {
      // end is closer
      return end
        .subtract(Math.floor(end.diff(target, "month", true)), "month")
        .toDate();
    }
  } else {
    throw Error(`invalid interval ${interval}`);
  }
}

export const test = { shiftToContainDate, shiftSubscriptionToEndOnDay };
