import getPool from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";
import { Service } from "@cocalc/util/db-schema/purchase-quotas";

const logger = getLogger("purchase:create-purchase");

/*
Creates the requested purchase if possible, given the user's quota.  If not, throws an exception.
*/
export default async function createPurchase({
  account_id,
  project_id,
  cost,
  service,
  description,
  notes,
  tag,
}: {
  account_id: string;
  project_id?: string;
  cost: number;
  service: Service;
  description: Description;
  notes?: string;
  tag?: string;
}): Promise<number> {
  const pool = getPool();
  let eps = 3000;
  let error = Error("unable to create purchase");
  for (let i = 0; i < 10; i++) {
    try {
      const { rows } = await pool.query(
        "INSERT INTO purchases (time, account_id, project_id, cost, service, description, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [account_id, project_id, cost, service, description, notes, tag]
      );
      logger.debug("Created new purchase", {
        account_id,
        project_id,
        cost,
        service,
        description,
      });
      return rows[0].id;
    } catch (err) {
      error = err;
      // could be ill-timed database outage...?
      logger.debug("Failed to insert purchase into purchases table.", {
        account_id,
        project_id,
        cost,
        service,
        description,
        err,
      });
      await delay(eps);
      eps *= 1.3;
    }
  }
  throw error;
}