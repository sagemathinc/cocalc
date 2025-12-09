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
      async reportProjectState({ project_id, state, host_id }) {
        if (!project_id || !state) {
          throw Error("project_id and state are required");
        }
        const pool = getPool();
        // If the reporting host does not own this project, ignore the update
        // and tell the host to clean up its local copy. This prevents stale
        // hosts from flipping placement.
        if (host_id) {
          const { rows } = await pool.query<{
            host_id: string | null;
          }>("SELECT host_id FROM projects WHERE project_id=$1", [project_id]);
          const currentHost = rows[0]?.host_id ?? null;
          if (currentHost && currentHost !== host_id) {
            throw Error(
              `state report ignored: project assigned to ${currentHost}, not ${host_id}; delete local copy`,
            );
          }
        }
        const stateObj =
          typeof state === "string" ? { state, time: new Date().toISOString() } : state;
        // NOTE: Do not mutate host/placement here; host assignment is explicit
        // via move/start flows. Updating host_id/host from heartbeat reports
        // can cause split-brain if multiple hosts still have a local row.
        await pool.query("UPDATE projects SET state=$2::jsonb WHERE project_id=$1", [
          project_id,
          stateObj,
        ]);
      },
    },
  });
}
