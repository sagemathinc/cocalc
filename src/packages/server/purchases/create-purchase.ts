import getPool from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";
import { Service } from "@cocalc/util/db-schema/purchase-quotas";

const logger = getLogger("purchase:create-purchase");

/*
Creates the requested purchase if possible, given the user's quota.  If not, throws an exception.
*/
interface Options {
  account_id: string;
  project_id?: string;
  cost?: number; // if cost not known yet, don't give.  E.g., for project-upgrade, the cost isn't known until project stops (or we close out a purchase interval).
  cost_per_hour?: number;
  period_start?: Date; // options; used mainly for analytics, e.g., for a license with given start and end dates.
  period_end?: Date;
  service: Service;
  description: Description;
  invoice_id?: string;
  notes?: string;
  tag?: string;
}

export default async function createPurchase(opts: Options): Promise<number> {
  const {
    account_id,
    project_id,
    cost,
    cost_per_hour,
    period_start,
    period_end,
    service,
    description,
    invoice_id,
    notes,
    tag,
  } = opts;
  const pool = getPool();
  let eps = 3000;
  if (cost == null && (cost_per_hour == null || period_start == null)) {
    throw Error(
      "if cost is not set, then cost_per_hour and period_start must both be set"
    );
  }
  let error = Error("unable to create purchase");
  for (let i = 0; i < 10; i++) {
    try {
      const { rows } = await pool.query(
        "INSERT INTO purchases (time, account_id, project_id, cost, cost_per_hour, period_start, period_end, service, description,invoice_id, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
        [
          account_id,
          project_id,
          cost,
          cost_per_hour,
          period_start,
          period_end,
          service,
          description,
          invoice_id,
          notes,
          tag,
        ]
      );
      const { id } = rows[0];
      logger.debug("Created new purchase", "id=", id, "opts = ", opts);
      return id;
    } catch (err) {
      error = err;
      // could be ill-timed database outage...?
      logger.debug(
        "Failed to insert purchase into purchases table.",
        err,
        opts
      );
      await delay(eps);
      eps *= 1.3;
    }
  }
  throw error;
}
