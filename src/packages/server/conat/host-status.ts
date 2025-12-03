import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import { createHostStatusService } from "@cocalc/conat/project-host/api";
import getPool from "@cocalc/database/pool";

const logger = getLogger("server:conat:host-status");

export async function initHostStatusService() {
  logger.info("starting host status service");
  return await createHostStatusService({
    client: await conat(),
    impl: {
      async reportProjectState({ project_id, state, host_id, host }) {
        if (!project_id || !state) {
          throw Error("project_id and state are required");
        }
        const pool = getPool();
        const stateObj =
          typeof state === "string" ? { state, time: new Date().toISOString() } : state;
        const values: any[] = [project_id, stateObj];
        const setParts = [`state=$2::jsonb`];
        if (host_id) {
          values.push(host_id);
          setParts.push(`host_id=$${values.length}`);
        }
        if (host) {
          values.push(JSON.stringify(host));
          setParts.push(`host=$${values.length}::jsonb`);
        }
        const sql = `UPDATE projects SET ${setParts.join(
          ", ",
        )} WHERE project_id=$1`;
        await pool.query(sql, values);
      },
    },
  });
}
