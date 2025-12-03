import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import getPool from "@cocalc/database/pool";
import { createHostControlClient } from "@cocalc/conat/project-host/api";

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
  compute_image?: string;
  host_id?: string;
  host?: any;
};

const pool = () => getPool();

async function loadProject(project_id: string): Promise<ProjectMeta> {
  const { rows } = await pool().query(
    "SELECT title, users, compute_image, host_id, host FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (!rows[0]) throw Error(`project ${project_id} not found`);
  return rows[0];
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

  await client.createProject({
    project_id,
    title: meta.title,
    users: meta.users,
    image: meta.compute_image,
    start: true,
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
  const client = createHostControlClient({
    host_id: placement.host_id,
    client: await conat(),
  });
  try {
    await client.startProject({ project_id });
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
