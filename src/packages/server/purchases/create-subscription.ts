import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { is_date as isDate, is_integer } from "@cocalc/util/misc";

type Options = Omit<Subscription, "id" | "created" | "notes">;

export default async function createSubscription(
  opts: Options
): Promise<number> {
  const pool = getPool();

  // some consistency checks below.  It's very likely this should always hold,
  // since data isn't user supplied, but it's still good to be careful.

  if (!(await isValidAccount(opts.account_id))) {
    throw Error("account_id must be valid");
  }
  if (!opts.cost || opts.cost < 0) {
    throw Error("cost must be positive");
  }
  if (opts.interval != "month" && opts.interval != "year") {
    throw Error("interval must be month or year");
  }
  if (!isDate(opts.current_period_start)) {
    throw Error("current_period_start must be a Date");
  }
  if (!isDate(opts.current_period_end)) {
    throw Error("current_period_end must be a Date");
  }
  if (opts.current_period_start >= opts.current_period_end) {
    throw Error("start must be before end");
  }
  if (!is_integer(opts.latest_purchase_id) || opts.latest_purchase_id < 0) {
    throw Error("latest_purchase_id must be a nonnegative integer");
  }
  if (typeof opts.metadata != "object" || !opts.metadata.type) {
    throw Error("metadata must be a nontrivial object with type field");
  }

  const { rows } = await pool.query(
    "INSERT INTO subscriptions (account_id,created,cost,interval,current_period_start,current_period_end,latest_purchase_id,status,metadata) VALUES($1,NOW(),$2,$3,$4,$5,$6,'active',$7)  RETURNING id",
    [
      opts.account_id,
      opts.cost,
      opts.interval,
      opts.current_period_start,
      opts.current_period_end,
      opts.latest_purchase_id,
      opts.metadata,
    ]
  );
  const { id } = rows[0];
  return id;
}
