import getPool from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { getPurchaseQuotas } from "./purchase-quotas";
import getBalance from "./get-balance";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";

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

// Throws an exception if purchase is not allowed.  Code should
// call this before giving the thing and doing createPurchase.
// This is NOT part of createPurchase, since we could easily call
// createPurchase after providing the service.
export async function assertPurchaseAllowed({
  account_id,
  service,
  cost,
}: {
  account_id: string;
  service: Service;
  cost: number;
}) {
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    throw Error(`cost must be positive`);
  }
  const { services, global } = await getPurchaseQuotas(account_id);
  // First check that the overall quota is not exceeded
  const balance = await getBalance(account_id);
  if (balance + cost > global) {
    throw Error(
      `Insufficient quota.  balance + potential_cost > global quota.   $${balance} + $${cost} > $${global}.  Verify your email address, add credit, or contact support to increase your global quota.`
    );
  }
  // Next check that the quota for the specific service is not exceeded
  const specific = services[service];
  if (specific == null) {
    throw Error(
      `You must explicitly set a quota for the "${
        QUOTA_SPEC[service]?.display ?? service
      }" service.`
    );
  }
  // allowed :-)
}
