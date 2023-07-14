import getPool, { PoolClient } from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import getLogger from "@cocalc/backend/logger";
import { Service } from "@cocalc/util/db-schema/purchase-quotas";
import { getClosingDay } from "./closing-date";

const logger = getLogger("purchase:create-purchase");

/*
Creates the requested purchase if possible, given the user's quota.  If not, throws an exception.
*/
interface Options {
  account_id: string;
  service: Service;
  description: Description;
  client: PoolClient | null; // all purchases have to explicitly set client (possibly to null), to strongly encourage doing them as part of an atomic transaction.
  project_id?: string;
  cost?: number; // if cost not known yet, don't give.  E.g., for project-upgrade, the cost isn't known until project stops (or we close out a purchase interval).
  cost_per_hour?: number;
  period_start?: Date; // options; used mainly for analytics, e.g., for a license with given start and end dates.
  period_end?: Date;
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
    client,
  } = opts;
  if (cost == null && (cost_per_hour == null || period_start == null)) {
    throw Error(
      "if cost is not set, then cost_per_hour and period_start must both be set"
    );
  }
  const { rows } = await (client ?? getPool()).query(
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
  ensureClosingDateDefined(account_id);
  return id;
}

async function ensureClosingDateDefined(account_id: string) {
  try {
    await getClosingDay(account_id);
  } catch (_) {}
}
