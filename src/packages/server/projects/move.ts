import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
  parseR2Region,
} from "@cocalc/util/consts";
import {
  loadHostFromRegistry,
  savePlacement,
  startProjectOnHost,
  stopProjectOnHost,
} from "../project-host/control";
import { createBackup } from "../conat/api/project-backups";

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
  last_backup?: string | null;
  last_edited?: string | null;
  project_state?: string | null;
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
    last_backup: string | null;
    last_edited: string | null;
    project_state: string | null;
  }>(
    "SELECT project_id, host_id, region, last_backup, last_edited, state->>'state' AS project_state FROM projects WHERE project_id=$1",
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
    "SELECT id, region, status FROM project_hosts WHERE id=$1 AND deleted IS NOT TRUE",
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
    last_backup: projectRow.last_backup,
    last_edited: projectRow.last_edited,
    project_state: projectRow.project_state,
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
    project_state: context.project_state,
    last_backup: context.last_backup,
    last_edited: context.last_edited,
  });
  const projectRunning = ["running", "starting"].includes(
    String(context.project_state ?? ""),
  );
  if (projectRunning) {
    log.info("moveProjectToHost stopping project before move", {
      project_id: context.project_id,
      project_state: context.project_state,
    });
    try {
      await stopProjectOnHost(context.project_id);
    } catch (err) {
      log.error("moveProjectToHost failed to stop project", {
        project_id: context.project_id,
        project_state: context.project_state,
        err,
      });
      throw err;
    }
  } else {
    log.info("moveProjectToHost skip stop (project not running)", {
      project_id: context.project_id,
      project_state: context.project_state,
    });
  }
  const lastEdited =
    context.last_edited != null ? new Date(context.last_edited) : undefined;
  const lastBackup =
    context.last_backup != null ? new Date(context.last_backup) : undefined;
  const backupNeeded =
    !lastBackup || (lastEdited && lastEdited > lastBackup);
  log.info("moveProjectToHost backup requirement", {
    project_id: context.project_id,
    backup_needed: backupNeeded,
    last_backup: lastBackup ? lastBackup.toISOString() : null,
    last_edited: lastEdited ? lastEdited.toISOString() : null,
  });
  if (backupNeeded) {
    log.info("moveProjectToHost creating backup", {
      project_id: context.project_id,
    });
    try {
      await createBackup({
        account_id: context.account_id,
        project_id: context.project_id,
      });
      log.info("moveProjectToHost backup created", {
        project_id: context.project_id,
      });
    } catch (err) {
      log.error("moveProjectToHost backup failed", {
        project_id: context.project_id,
        err,
      });
      throw err;
    }
  } else {
    log.info("moveProjectToHost backup not needed", {
      project_id: context.project_id,
    });
  }
  const destHost = await loadHostFromRegistry(context.dest_host_id);
  if (!destHost) {
    throw new Error(`host ${context.dest_host_id} not found`);
  }
  try {
    await savePlacement(context.project_id, {
      host_id: context.dest_host_id,
      host: destHost,
    });
    log.info("moveProjectToHost placement updated", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
    });
  } catch (err) {
    log.error("moveProjectToHost placement update failed", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
      err,
    });
    throw err;
  }
  try {
    await startProjectOnHost(context.project_id);
    log.info("moveProjectToHost started project on destination host", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
    });
  } catch (err) {
    log.warn("moveProjectToHost start failed after placement update", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
      err,
    });
    throw err;
  }
}
