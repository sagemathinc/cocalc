import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
  parseR2Region,
} from "@cocalc/util/consts";

const log = getLogger("server:projects:move");

export type MoveProjectToHostInput = {
  project_id: string;
  dest_host_id: string;
  account_id: string;
};

type MoveProjectContext = {
  project_id: string;
  dest_host_id: string;
  account_id: string;
  project_region: string;
  dest_region: string;
  project_host_id?: string | null;
};

async function buildMoveProjectContext(
  input: MoveProjectToHostInput,
): Promise<MoveProjectContext> {
  const { project_id, dest_host_id, account_id } = input;
  const pool = getPool();
  const projectResult = await pool.query<{
    project_id: string;
    host_id: string | null;
    region: string | null;
  }>(
    "SELECT project_id, host_id, region FROM projects WHERE project_id=$1",
    [project_id],
  );
  const projectRow = projectResult.rows[0];
  if (!projectRow) {
    throw new Error(`project ${project_id} not found`);
  }
  const hostResult = await pool.query<{
    id: string;
    region: string | null;
    status: string | null;
  }>(
    "SELECT id, region, status FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [dest_host_id],
  );
  const hostRow = hostResult.rows[0];
  if (!hostRow) {
    throw new Error(`host ${dest_host_id} not found`);
  }
  const project_region =
    parseR2Region(projectRow.region) ?? DEFAULT_R2_REGION;
  const dest_region = mapCloudRegionToR2Region(hostRow.region);
  if (project_region !== dest_region) {
    throw new Error(
      `project region ${project_region} does not match host region ${dest_region}`,
    );
  }
  return {
    project_id,
    dest_host_id,
    account_id,
    project_region,
    dest_region,
    project_host_id: projectRow.host_id,
  };
}

export async function moveProjectToHost(
  input: MoveProjectToHostInput,
): Promise<void> {
  // Implementation planned in src/.agents/buckets.md (Phase 2).
  const context = await buildMoveProjectContext(input);
  log.debug("moveProjectToHost context", {
    project_id: context.project_id,
    dest_host_id: context.dest_host_id,
    project_region: context.project_region,
    dest_region: context.dest_region,
    project_host_id: context.project_host_id,
  });
  throw new Error("moveProjectToHost not implemented yet");
}
