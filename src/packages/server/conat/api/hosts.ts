import { randomUUID } from "crypto";
import type {
  Host,
  HostMachine,
  HostStatus,
} from "@cocalc/conat/hub/api/hosts";
import getPool from "@cocalc/database/pool";
import {
  computePlacementPermission,
  getUserHostTier,
} from "@cocalc/server/project-host/placement";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";
import { enqueueCloudVmWork } from "@cocalc/server/cloud";
function pool() {
  return getPool();
}

function requireAccount(account_id?: string): string {
  if (!account_id) {
    throw new Error("must be signed in to manage hosts");
  }
  return account_id;
}

function parseRow(
  row: any,
  opts: {
    scope?: Host["scope"];
    can_start?: boolean;
    can_place?: boolean;
    reason_unavailable?: string;
  } = {},
): Host {
  const metadata = row.metadata ?? {};
  const machine: HostMachine | undefined = metadata.machine;
  return {
    id: row.id,
    name: row.name ?? "Host",
    owner: metadata.owner ?? "",
    region: row.region ?? "",
    size: metadata.size ?? "",
    gpu: !!metadata.gpu,
    status: (row.status as HostStatus) ?? "off",
    machine,
    projects: row.capacity?.projects ?? 0,
    last_seen: row.last_seen
      ? new Date(row.last_seen).toISOString()
      : undefined,
    tier: normalizeHostTier(row.tier),
    scope: opts.scope,
    can_start: opts.can_start,
    can_place: opts.can_place,
    reason_unavailable: opts.reason_unavailable,
  };
}

async function loadOwnedHost(id: string, account_id?: string): Promise<any> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("host not found");
  }
  if (row.metadata?.owner && row.metadata.owner !== owner) {
    throw new Error("not authorized");
  }
  return row;
}

async function loadHostForStartStop(
  id: string,
  account_id?: string,
): Promise<any> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("host not found");
  }
  const metadata = row.metadata ?? {};
  const isOwner = metadata.owner === owner;
  if (isOwner) return row;
  const collaborators = (metadata.collaborators ?? []) as string[];
  const isCollab = collaborators.includes(owner);
  if (isCollab && !!metadata.host_collab_control) {
    return row;
  }
  throw new Error("not authorized");
}

function normalizeHostTier(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function loadMembership(account_id: string) {
  return await resolveMembershipForAccount(account_id);
}

function requireCreateHosts(entitlements: any) {
  const canCreate = entitlements?.features?.create_hosts === true;
  if (!canCreate) {
    throw new Error("membership does not allow host creation");
  }
}


export async function listHosts({
  account_id,
  admin_view,
  catalog,
}: {
  account_id?: string;
  admin_view?: boolean;
  catalog?: boolean;
}): Promise<Host[]> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(
    admin_view
      ? `SELECT * FROM project_hosts ORDER BY updated DESC NULLS LAST, created DESC NULLS LAST`
      : `SELECT * FROM project_hosts WHERE (metadata->>'owner' = $1) OR tier IS NOT NULL ORDER BY updated DESC NULLS LAST, created DESC NULLS LAST`,
    admin_view ? [] : [owner],
  );

  const membership = await loadMembership(owner);
  const userTier = getUserHostTier(membership.entitlements);

  const result: Host[] = [];
  for (const row of rows) {
    const metadata = row.metadata ?? {};
    const rowOwner = metadata.owner ?? "";
    const isOwner = rowOwner === owner;
    const collaborators = (metadata.collaborators ?? []) as string[];
    const isCollab = collaborators.includes(owner);
    const tier = normalizeHostTier(row.tier);
    const shared = tier != null;

    const scope: Host["scope"] = isOwner
      ? "owned"
      : isCollab
        ? "collab"
        : shared
          ? "pool"
          : "shared";

    const { can_place, reason_unavailable } = computePlacementPermission({
      tier,
      userTier,
      isOwner,
      isCollab,
    });

    const can_start = isOwner || (isCollab && !!metadata.host_collab_control);

    // If catalog=false, filter out what user cannot place
    if (!catalog && !can_place) {
      continue;
    }

    result.push(
      parseRow(row, {
        scope,
        can_place,
        can_start,
        reason_unavailable,
      }),
    );
  }
  return result;
}

export async function createHost({
  account_id,
  name,
  region,
  size,
  gpu = false,
  machine,
}: {
  account_id?: string;
  name: string;
  region: string;
  size: string;
  gpu?: boolean;
  machine?: Host["machine"];
}): Promise<Host> {
  const owner = requireAccount(account_id);
  const membership = await loadMembership(owner);
  requireCreateHosts(membership.entitlements);
  const id = randomUUID();
  const now = new Date();
  const machineCloud = machine?.cloud;
  const initialStatus = machineCloud ? "starting" : "off";
  await pool().query(
    `INSERT INTO project_hosts (id, name, region, status, metadata, created, updated, last_seen)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6)`,
    [
      id,
      name,
      region,
      initialStatus,
      {
        owner,
        size,
        gpu,
        machine: machine ?? {},
      },
      now,
    ],
  );
  if (machineCloud) {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "provision",
      payload: { provider: machineCloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("host not found after create");
  return parseRow(row, {
    scope: "owned",
    can_start: true,
    can_place: true,
  });
}

export async function startHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  const row = await loadHostForStartStop(id, account_id);
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
    [id, "starting", new Date()],
  );
  if (!machine.cloud) {
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
      [id, "running", new Date()],
    );
  } else {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "start",
      payload: { provider: machine.cloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1`,
    [id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function stopHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  const row = await loadHostForStartStop(id, account_id);
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
    [id, "stopping", new Date()],
  );
  if (!machine.cloud) {
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
      [id, "off", new Date()],
    );
  } else {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "stop",
      payload: { provider: machine.cloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1`,
    [id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function deleteHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  const row = await loadOwnedHost(id, account_id);
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  if (machine.cloud) {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "delete",
      payload: { provider: machine.cloud },
    });
    await pool().query(
      `UPDATE project_hosts SET status=$2, updated=NOW() WHERE id=$1`,
      [id, "stopping"],
    );
    return;
  }
  await pool().query(`DELETE FROM project_hosts WHERE id=$1`, [id]);
}
