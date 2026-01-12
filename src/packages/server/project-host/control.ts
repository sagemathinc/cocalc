import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { createHostControlClient } from "@cocalc/conat/project-host/api";
import sshKeys from "../projects/get-ssh-keys";
import { notifyProjectHostUpdate } from "../conat/route-project";
import { conatWithProjectRouting } from "../conat/route-client";
import {
  ensureMoveSchema,
  upsertMove,
  updateMove,
} from "./move-db";
import { normalizeHostTier } from "./placement";
import { machineHasGpu } from "../cloud/host-gpu";

const log = getLogger("server:project-host:control");

type HostPlacement = {
  host_id: string;
  host: {
    name?: string;
    region?: string;
    tier?: number;
    public_url?: string;
    internal_url?: string;
    ssh_server?: string;
  };
};

export type ProjectMeta = {
  title?: string;
  users?: any;
  image?: string;
  host_id?: string;
  host?: any;
  authorized_keys?: string;
  run_quota?: any;
};

const pool = () => getPool();

export async function loadProject(project_id: string): Promise<ProjectMeta> {
  const { rows } = await pool().query(
    // Prefer an explicit rootfs_image, but fall back to compute_image so legacy
    // rows created before rootfs_image existed still work.
    "SELECT title, users, COALESCE(rootfs_image, compute_image) as image, host_id, host, run_quota FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (!rows[0]) throw Error(`project ${project_id} not found`);
  const keys = await sshKeys(project_id);
  const authorized_keys = Object.values(keys)
    .map((k: any) => k.value)
    .join("\n");
  return { ...rows[0], authorized_keys };
}

async function hostHasGpu(host_id: string): Promise<boolean> {
  const { rows } = await pool().query(
    "SELECT metadata FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [host_id],
  );
  const metadata = rows[0]?.metadata ?? {};
  const machine = metadata?.machine ?? {};
  return machineHasGpu(machine);
}

async function applyHostGpuToRunQuota(
  run_quota: any | undefined,
  host_id: string,
): Promise<any> {
  const quota = run_quota ? { ...run_quota } : {};
  if (await hostHasGpu(host_id)) {
    quota.gpu = true;
  } else {
    if (Object.prototype.hasOwnProperty.call(quota, "gpu")) {
      quota.gpu = false;
    }
    if (Object.prototype.hasOwnProperty.call(quota, "gpu_count")) {
      delete quota.gpu_count;
    }
  }
  return quota;
}

export async function loadHostFromRegistry(host_id: string) {
  const { rows } = await pool().query(
    "SELECT name, region, public_url, internal_url, ssh_server, tier FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [host_id],
  );
  if (!rows[0]) return undefined;
  rows[0].tier = normalizeHostTier(rows[0].tier);
  return rows[0];
}

export async function selectActiveHost(exclude_host_id?: string) {
  const { rows } = await pool().query(
    `
      SELECT id, name, region, public_url, internal_url, ssh_server, tier
      FROM project_hosts
      WHERE status='running'
        AND deleted IS NULL
        AND last_seen > NOW() - interval '2 minutes'
        ${exclude_host_id ? "AND id != $1" : ""}
      ORDER BY random()
      LIMIT 1
    `,
    exclude_host_id ? [exclude_host_id] : [],
  );
  if (!rows[0]) return undefined;
  rows[0].tier = normalizeHostTier(rows[0].tier);
  return rows[0];
}

export async function savePlacement(
  project_id: string,
  placement: HostPlacement,
) {
  await pool().query(
    "UPDATE projects SET host_id=$1, host=$2::jsonb WHERE project_id=$3",
    [placement.host_id, JSON.stringify(placement.host), project_id],
  );
  await notifyProjectHostUpdate({
    project_id,
    host_id: placement.host_id,
    host: placement.host,
  });
}

async function ensurePlacement(project_id: string): Promise<HostPlacement> {
  const meta = await loadProject(project_id);
  if (meta.host_id) {
    const hostInfo =
      meta.host ?? (await loadHostFromRegistry(meta.host_id)) ?? undefined;
    if (!hostInfo) {
      // Project is already placed, but the host is missing/unregistered.
      // Never auto-reassign here to avoid split-brain/data loss; require an explicit move.
      throw Error(
        `project is assigned to host ${meta.host_id} but it is unavailable`,
      );
    }
    if (!meta.host) {
      await savePlacement(project_id, {
        host_id: meta.host_id,
        host: hostInfo,
      });
    }
    return { host_id: meta.host_id, host: hostInfo };
  }

  const chosen = await selectActiveHost();
  if (!chosen) {
    throw Error("no running project-host available");
  }

  const client = createHostControlClient({
    host_id: chosen.id,
    client: conatWithProjectRouting(),
  });

  log.debug("createProject on remote project host", {
    project_id,
    meta,
    host_id: chosen.id,
  });

  const run_quota = await applyHostGpuToRunQuota(meta.run_quota, chosen.id);

  await client.createProject({
    project_id,
    title: meta.title,
    users: meta.users,
    image: meta.image,
    start: true,
    authorized_keys: meta.authorized_keys,
    run_quota,
  });

  const placement: HostPlacement = {
    host_id: chosen.id,
    host: {
      name: chosen.name,
      region: chosen.region,
      public_url: chosen.public_url,
      internal_url: chosen.internal_url,
      ssh_server: chosen.ssh_server,
      tier: normalizeHostTier(chosen.tier),
    },
  };

  await savePlacement(project_id, placement);
  return placement;
}

export async function startProjectOnHost(project_id: string): Promise<void> {
  const placement = await ensurePlacement(project_id);
  const meta = await loadProject(project_id);
  const run_quota = await applyHostGpuToRunQuota(
    meta.run_quota,
    placement.host_id,
  );
  const { rows } = await pool().query<{ backup_bucket_id: string | null }>(
    "SELECT backup_bucket_id FROM projects WHERE project_id=$1",
    [project_id],
  );
  const restore = rows[0]?.backup_bucket_id ? "auto" : "none";
  const client = createHostControlClient({
    host_id: placement.host_id,
    client: conatWithProjectRouting(),
  });
  try {
    await client.startProject({
      project_id,
      authorized_keys: meta.authorized_keys,
      run_quota,
      image: meta.image,
      restore,
    });
  } catch (err) {
    log.warn("startProjectOnHost failed", { project_id, host: placement, err });
    throw err;
  }
}

export async function stopProjectOnHost(project_id: string): Promise<void> {
  const meta = await loadProject(project_id);
  const host_id = meta.host_id;
  if (!host_id) {
    throw Error("project has no host_id");
  }
  const client = createHostControlClient({
    host_id,
    client: conatWithProjectRouting(),
  });
  try {
    await client.stopProject({ project_id });
  } catch (err) {
    log.warn("stopProjectOnHost failed", { project_id, host_id, err });
    throw err;
  }
}

export async function updateAuthorizedKeysOnHost(
  project_id: string,
): Promise<void> {
  const meta = await loadProject(project_id);
  const host_id = meta.host_id;
  if (!host_id) {
    return;
  }
  const client = createHostControlClient({
    host_id,
    client: conatWithProjectRouting(),
  });
  try {
    await client.updateAuthorizedKeys({
      project_id,
      authorized_keys: meta.authorized_keys,
    });
  } catch (err) {
    log.warn("updateAuthorizedKeysOnHost failed", { project_id, host_id, err });
  }
}

export async function moveProjectToHost({
  project_id,
  dest_host_id,
}: {
  project_id: string;
  dest_host_id: string;
}): Promise<void> {
  await requestMoveToHost({ project_id, dest_host_id });
}

export async function requestMoveToHost({
  project_id,
  dest_host_id,
}: {
  project_id: string;
  dest_host_id?: string;
}): Promise<void> {
  await ensureMoveSchema();
  const meta = await loadProject(project_id);
  if (!meta.host_id) {
    throw Error("project has no current host");
  }
  const dest =
    dest_host_id ??
    (await selectActiveHost(meta.host_id))?.id ??
    (() => {
      throw Error("no running project-host available");
    })();

  if (dest === meta.host_id) {
    // Nothing to do; clear any prior move state.
    await updateMove(project_id, {
      state: "done",
      status_reason: "already on destination host",
      dest_host_id: dest,
      source_host_id: meta.host_id,
    });
    return;
  }

  await upsertMove({
    project_id,
    source_host_id: meta.host_id,
    dest_host_id: dest,
    state: "queued",
    status_reason: null,
    snapshot_name: null,
    progress: { phase: "queued" },
  });
}
