/*
Manage spend limit "automatic shutdown" of compute servers.

Call this function periodically to do the next round of checks.  Each
compute server with configuration.spendingLimit?.enabled gets checked
for how much has been spent during the configured interval, and if it
exceeds the limit, the server gets stopped.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { stop } from "@cocalc/server/compute/control";
import { uuid } from "@cocalc/util/misc";
import type { ComputeServerEventLogEntry } from "@cocalc/util/compute/log";
import { map } from "awaiting";
import {
  type SpendLimit,
  validatedSpendLimit,
} from "@cocalc/util/db-schema/compute-servers";
import getPurchases from "@cocalc/server/purchases/get-purchases";
import dayjs from "dayjs";

const logger = getLogger("server:compute:maintenance:cloud:spend-limit");

export default async function spendLimit() {
  try {
    await update();
  } catch (err) {
    logger.debug(
      `WARNING - unexpected issue running idle timeout update loop: ${err}`,
    );
  }
}

async function update() {
  logger.debug("update");
  const pool = getPool();
  // finds all rows where: state is "running" and configuration.spendLimit.enabled is true,
  const { rows } = await pool.query(
    `
SELECT id, account_id, project_id, configuration#>'{spendLimit}' AS spend_limit
FROM compute_servers
WHERE state = 'running'
  AND (configuration#>>'{spendLimit,enabled}')::boolean = true
`,
  );
  logger.debug(`got ${rows.length} servers with an enabled spend limit:`, rows);
  const f = async (row) => {
    logger.debug("checking if spend limit is hit", row);
    const { dollars, hours } = validatedSpendLimit(row.spend_limit ?? {})!;
    const { purchases } = await getPurchases({
      compute_server_id: row.id,
      account_id: row.account_id,
      group: true,
      cutoff: dayjs().subtract(hours, "hour").toDate(),
    });
    let total = 0;
    for (const { cost, cost_so_far } of purchases) {
      total += cost ?? cost_so_far ?? 0;
    }
    try {
      await pool.query("UPDATE compute_servers SET spend=$1 where id=$2", [
        total,
        row.id,
      ]);
    } catch (err) {
      logger.debug(`WARNING -- unable to update spend field -- ${err}`);
    }
    if (total < dollars) {
      logger.debug("spend is under the limit -- nothing to do", row);
      return;
    }
    try {
      await createProjectLogEntry({ ...row, total });
      const { account_id, id } = row;
      await stop({ account_id, id });
    } catch (err) {
      logger.debug(
        `WARNING -- failed to stop ${row.id} in response to idle timeout -- ${err}`,
      );
    }
  };
  await map(rows, 20, f);
}

async function createProjectLogEntry({
  id,
  account_id,
  project_id,
  spend_limit,
  total,
}: {
  id: number;
  account_id: string;
  project_id: string;
  spend_limit: SpendLimit;
  total: number;
}) {
  logger.debug("log entry that we spend limit terminated compute server", {
    id,
  });
  const pool = getPool();
  await pool.query(
    "INSERT INTO project_log(id, project_id, account_id, time, event) VALUES($1,$2,$3,NOW(),$4)",
    [
      uuid(),
      project_id,
      account_id,
      {
        event: "compute-server",
        action: "spend-limit",
        spendLimit: spend_limit,
        total,
        server_id: id,
      } as ComputeServerEventLogEntry,
    ],
  );
}
