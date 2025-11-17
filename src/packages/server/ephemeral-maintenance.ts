import getPool from "@cocalc/database/pool";
import deleteAccount from "@cocalc/server/accounts/delete";
import deleteProject from "@cocalc/server/projects/delete";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("server:ephemeral-maintenance");

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 25;

export default function initEphemeralMaintenance(): void {
  log.info("Starting ephemeral maintenance loop", {
    CHECK_INTERVAL_MS,
    BATCH_SIZE,
  });
  const run = async () => {
    try {
      await deleteExpiredProjects();
      await deleteExpiredAccounts();
    } catch (err) {
      log.error("ephemeral maintenance failed", err);
    }
  };
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

async function deleteExpiredProjects(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT project_id
       FROM projects
      WHERE deleted IS NOT true
        AND ephemeral IS NOT NULL
        AND ephemeral > 0
        AND created + ephemeral * interval '1 millisecond' < NOW()
      LIMIT $1`,
    [BATCH_SIZE],
  );
  for (const { project_id } of rows ?? []) {
    try {
      await deleteProject({ project_id, skipPermissionCheck: true });
      log.info("deleted expired ephemeral project", { project_id });
    } catch (err) {
      log.error("failed to delete ephemeral project", { project_id, err });
    }
  }
}

async function deleteExpiredAccounts(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT account_id
       FROM accounts
      WHERE deleted IS NOT true
        AND ephemeral IS NOT NULL
        AND ephemeral > 0
        AND created + ephemeral * interval '1 millisecond' < NOW()
      LIMIT $1`,
    [BATCH_SIZE],
  );
  for (const { account_id } of rows ?? []) {
    try {
      await deleteAccount(account_id);
      log.info("deleted expired ephemeral account", { account_id });
    } catch (err) {
      log.error("failed to delete ephemeral account", { account_id, err });
    }
  }
}
