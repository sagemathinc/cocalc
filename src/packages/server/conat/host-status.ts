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
            logger.debug("ignoring state from non-owner host", {
              project_id,
              currentHost,
              host_id,
            });
            return { action: "delete" as const };
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
      async reportProjectProvisioned({
        project_id,
        provisioned,
        host_id,
        checked_at,
      }) {
        if (!project_id || provisioned === undefined) {
          throw Error("project_id and provisioned are required");
        }
        const pool = getPool();
        if (host_id) {
          const { rows } = await pool.query<{
            host_id: string | null;
          }>("SELECT host_id FROM projects WHERE project_id=$1", [project_id]);
          const currentHost = rows[0]?.host_id ?? null;
          if (currentHost && currentHost !== host_id) {
            logger.debug("ignoring provisioned update from non-owner host", {
              project_id,
              currentHost,
              host_id,
            });
            return { action: "delete" as const };
          }
        }
        let checkedAt = new Date();
        if (checked_at != null) {
          const parsed = new Date(checked_at);
          if (!Number.isNaN(parsed.valueOf())) {
            checkedAt = parsed;
          }
        }
        await pool.query(
          "UPDATE projects SET provisioned=$2, provisioned_checked_at=$3 WHERE project_id=$1",
          [project_id, provisioned, checkedAt],
        );
      },
      async reportHostProvisionedInventory({
        host_id,
        project_ids,
        checked_at,
      }) {
        if (!host_id || !Array.isArray(project_ids)) {
          throw Error("host_id and project_ids are required");
        }
        const pool = getPool();
        let checkedAt = new Date();
        if (checked_at != null) {
          const parsed = new Date(checked_at);
          if (!Number.isNaN(parsed.valueOf())) {
            checkedAt = parsed;
          }
        }
        await pool.query(
          `
            UPDATE projects
            SET
              provisioned = (project_id = ANY($2)),
              provisioned_checked_at = $3
            WHERE host_id=$1
              AND deleted IS NOT true
              AND provisioned IS DISTINCT FROM (project_id = ANY($2))
          `,
          [host_id, project_ids, checkedAt],
        );
        if (!project_ids.length) {
          return { delete_project_ids: [] };
        }
        const { rows } = await pool.query<{ project_id: string }>(
          `
            SELECT project_id
            FROM projects
            WHERE project_id = ANY($1)
              AND host_id IS DISTINCT FROM $2
          `,
          [project_ids, host_id],
        );
        const delete_project_ids = rows.map((row) => row.project_id);
        return { delete_project_ids };
      },
    },
  });
}
