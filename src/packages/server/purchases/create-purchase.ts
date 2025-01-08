import dayjs from "dayjs";

import getLogger from "@cocalc/backend/logger";
import getPool, { PoolClient } from "@cocalc/database/pool";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Description } from "@cocalc/util/db-schema/purchases";
import { getClosingDay } from "./closing-date";

const logger = getLogger("purchase:create-purchase");

/*
Creates the requested purchase.  Makes no quota or balance checks.  This is called only
when the backend code has decided to allow this purchase.
*/
interface Options {
  account_id: string;
  service: Service;
  description: Description;
  client: PoolClient | null; // all purchases have to explicitly set client (possibly to null), to strongly encourage doing them as part of an atomic transaction.
  project_id?: string;
  // if cost not known yet, don't give.  E.g., for project-upgrade, the cost isn't known until project stops (or we close out a purchase interval).
  cost?: number;
  unrounded_cost?: number; // if given and we compute cost_per_hour, this will be used, since cost itself may be rounded!
  cost_per_hour?: number;
  cost_so_far?: number;
  period_start?: Date; // options; used mainly for analytics, e.g., for a license with given start and end dates.
  period_end?: Date;
  invoice_id?: string;
  notes?: string;
  tag?: string;
}

export default async function createPurchase(opts: Options): Promise<number> {
  let { cost_per_hour } = opts;
  const {
    account_id,
    project_id,
    unrounded_cost,
    cost,
    period_start,
    period_end,
    service,
    description,
    invoice_id,
    notes,
    tag,
    client,
    cost_so_far,
  } = opts;
  if (cost == null) {
    if (period_start == null) {
      throw Error("if cost is not set, then period_start must be set");
    }
    if (cost_so_far != null && cost_per_hour != null) {
      throw Error(
        "cost_so_far and cost_per_hour must not both be set, since cost_so_far being set indicates a metered purchase (e.g., amount of data transfer), and cost_per_hour being set indicates a rate-based purchase (e.g., amount per hour), and these are two completely different things",
      );
    }
  }
  if (
    cost_per_hour == null &&
    cost != null &&
    period_start != null &&
    period_end != null
  ) {
    const hours = dayjs(period_end).diff(dayjs(period_start), "hour", true);
    if (hours > 0) {
      cost_per_hour = (unrounded_cost ?? cost) / hours;
    }
  } else {
    // TODO: I don't know if there is something meaningful to do if there is no period, e.g., with GPT-4.
    // We could define an ai call as lasting for 3 minutes (say). Alternatively, we could actually look
    // at the time spent generating the output.  But is that really meaningful?
  }

  const { rows } = await (client ?? getPool()).query(
    "INSERT INTO purchases (time, account_id, project_id, cost, cost_per_hour, cost_so_far, period_start, period_end, service, description, invoice_id, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
    [
      account_id,
      project_id,
      cost,
      cost_per_hour,
      cost_so_far,
      period_start,
      period_end,
      service,
      description,
      invoice_id,
      notes,
      tag,
    ],
  );
  const { id } = rows[0];
  logger.debug("Created new purchase", "id=", id);
  ensureClosingDateDefined(account_id);
  return id;
}

async function ensureClosingDateDefined(account_id: string) {
  try {
    await getClosingDay(account_id);
  } catch (_) {}
}
