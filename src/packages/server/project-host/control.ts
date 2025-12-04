import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import getPool from "@cocalc/database/pool";
import { createHostControlClient } from "@cocalc/conat/project-host/api";
import sshKeys from "../projects/get-ssh-keys";

const log = getLogger("server:project-host:control");

type HostPlacement = {
  host_id: string;
  host: {
    public_url?: string;
    internal_url?: string;
    ssh_server?: string;
  };
};

type ProjectMeta = {
  title?: string;
  users?: any;
  image?: string;
  host_id?: string;
  host?: any;
  authorized_keys?: string;
  run_quota?: any;
};

const pool = () => getPool();

async function loadProject(project_id: string): Promise<ProjectMeta> {
  const { rows } = await pool().query(
    "SELECT title, users, rootfs_image as image, host_id, host, run_quota FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (!rows[0]) throw Error(`project ${project_id} not found`);
  const keys = await sshKeys(project_id);
  const authorized_keys = Object.values(keys)
    .map((k: any) => k.value)
    .join("\n");
  return { ...rows[0], authorized_keys };
}

async function loadHostFromRegistry(host_id: string) {
  const { rows } = await pool().query(
    "SELECT public_url, internal_url, ssh_server FROM project_hosts WHERE id=$1",
    [host_id],
  );
  return rows[0];
}

async function selectActiveHost() {
  const { rows } = await pool().query(
    `
      SELECT id, public_url, internal_url, ssh_server
      FROM project_hosts
      WHERE status='active' AND last_seen > NOW() - interval '2 minutes'
      ORDER BY random()
      LIMIT 1
    `,
  );
  return rows[0];
}

async function savePlacement(project_id: string, placement: HostPlacement) {
  await pool().query(
    "UPDATE projects SET host_id=$1, host=$2::jsonb WHERE project_id=$3",
    [placement.host_id, JSON.stringify(placement.host), project_id],
  );
}

async function ensurePlacement(project_id: string): Promise<HostPlacement> {
  const meta = await loadProject(project_id);
  if (meta.host_id) {
    const hostInfo =
      meta.host ?? (await loadHostFromRegistry(meta.host_id)) ?? undefined;
    if (hostInfo) {
      if (!meta.host) {
        await savePlacement(project_id, {
          host_id: meta.host_id,
          host: hostInfo,
        });
      }
      return { host_id: meta.host_id, host: hostInfo };
    }
  }

  const chosen = await selectActiveHost();
  if (!chosen) {
    throw Error("no active project-host available");
  }

  const client = createHostControlClient({
    host_id: chosen.id,
    client: await conat(),
  });

  log.debug("createProject on remote project host", {
    project_id,
    meta,
    host_id: chosen.id,
  });

  await client.createProject({
    project_id,
    title: meta.title,
    users: meta.users,
    image: meta.image,
    start: true,
    authorized_keys: meta.authorized_keys,
    run_quota: meta.run_quota,
  });

  const placement: HostPlacement = {
    host_id: chosen.id,
    host: {
      public_url: chosen.public_url,
      internal_url: chosen.internal_url,
      ssh_server: chosen.ssh_server,
    },
  };

  await savePlacement(project_id, placement);
  return placement;
}

export async function startProjectOnHost(project_id: string): Promise<void> {
  const placement = await ensurePlacement(project_id);
  const meta = await loadProject(project_id);
  const client = createHostControlClient({
    host_id: placement.host_id,
    client: await conat(),
  });
  try {
    await client.startProject({
      project_id,
      authorized_keys: meta.authorized_keys,
      run_quota: meta.run_quota,
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
    client: await conat(),
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
    client: await conat(),
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
