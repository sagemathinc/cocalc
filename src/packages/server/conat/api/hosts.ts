import { randomUUID } from "crypto";
import type { Host, HostMachine, HostStatus } from "@cocalc/conat/hub/api/hosts";
import getPool from "@cocalc/database/pool";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";
function pool() {
  return getPool();
}

function requireAccount(account_id?: string): string {
  if (!account_id) {
    throw new Error("must be signed in to manage hosts");
  }
  return account_id;
}

function parseRow(row: any): Host {
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
    last_seen: row.last_seen ? new Date(row.last_seen).toISOString() : undefined,
  };
}

async function loadOwnedHost(id: string, account_id?: string): Promise<any> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(`SELECT * FROM project_hosts WHERE id=$1`, [id]);
  const row = rows[0];
  if (!row) {
    throw new Error("host not found");
  }
  if (row.metadata?.owner && row.metadata.owner !== owner) {
    throw new Error("not authorized");
  }
  return row;
}

export async function listHosts({
  account_id,
}: {
  account_id?: string;
}): Promise<Host[]> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE metadata->>'owner' = $1 ORDER BY updated DESC NULLS LAST, created DESC NULLS LAST`,
    [owner],
  );
  return rows.map(parseRow);
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
  const id = randomUUID();
  const now = new Date();
  await pool().query(
    `INSERT INTO project_hosts (id, name, region, status, metadata, created, updated, last_seen)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6)`,
    [
      id,
      name,
      region,
      "off",
      {
        owner,
        size,
        gpu,
        machine: machine ?? {},
      },
      now,
    ],
  );
  return {
    id,
    name,
    owner,
    region,
    size,
    gpu,
    status: "off",
    machine,
    projects: 0,
    last_seen: now.toISOString(),
  };
}

export async function startHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  await loadOwnedHost(id, account_id);
  const now = new Date();
  // emit bootlog for host start
  bootlog({
    host_id: id,
    type: "starting",
    desc: "Starting host...",
    progress: 5,
  }).catch(() => {});
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
    [id, "running", now],
  );
  const { rows } = await pool().query(`SELECT * FROM project_hosts WHERE id=$1`, [id]);
  if (!rows[0]) throw new Error("host not found");
  bootlog({
    host_id: id,
    type: "running",
    desc: "Host is running",
    progress: 100,
  }).catch(() => {});
  return parseRow(rows[0]);
}

export async function stopHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  await loadOwnedHost(id, account_id);
  const now = new Date();
  bootlog({
    host_id: id,
    type: "stopping",
    desc: "Stopping host...",
    progress: 5,
  }).catch(() => {});
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1`,
    [id, "off", now],
  );
  const { rows } = await pool().query(`SELECT * FROM project_hosts WHERE id=$1`, [id]);
  if (!rows[0]) throw new Error("host not found");
  bootlog({
    host_id: id,
    type: "off",
    desc: "Host stopped",
    progress: 100,
  }).catch(() => {});
  return parseRow(rows[0]);
}

export async function deleteHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  await loadOwnedHost(id, account_id);
  await pool().query(`DELETE FROM project_hosts WHERE id=$1`, [id]);
}
