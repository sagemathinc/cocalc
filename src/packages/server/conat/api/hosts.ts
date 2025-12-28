import { randomUUID } from "crypto";
import type {
  Host,
  HostMachine,
  HostStatus,
  HostCatalog,
} from "@cocalc/conat/hub/api/hosts";
import getPool from "@cocalc/database/pool";
import {
  computePlacementPermission,
  getUserHostTier,
} from "@cocalc/server/project-host/placement";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";
import {
  enqueueCloudVmWork,
  listCloudVmLog,
  refreshCloudCatalogNow,
} from "@cocalc/server/cloud";
import isAdmin from "@cocalc/server/accounts/is-admin";
import { isValidUUID } from "@cocalc/util/misc";
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
    error: metadata.last_error,
    error_at: metadata.last_error_at,
    projects: row.capacity?.projects ?? 0,
    last_seen: row.last_seen
      ? new Date(row.last_seen).toISOString()
      : undefined,
    tier: normalizeHostTier(row.tier),
    scope: opts.scope,
    can_start: opts.can_start,
    can_place: opts.can_place,
    reason_unavailable: opts.reason_unavailable,
    last_action: metadata.last_action,
    last_action_at: metadata.last_action_at,
    last_action_status: metadata.last_action_status,
    last_action_error: metadata.last_action_error,
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

async function loadHostForView(
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
  const collaborators = (metadata.collaborators ?? []) as string[];
  const isCollab = collaborators.includes(owner);
  if (isOwner || isCollab) return row;
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

async function getSiteSetting(name: string): Promise<string | undefined> {
  const { rows } = await pool().query<{ value: string | null }>(
    "SELECT value FROM site_settings WHERE name=$1",
    [name],
  );
  const value = rows[0]?.value ?? undefined;
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

const DEFAULT_BACKUP_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const DEFAULT_BACKUP_ROOT = "rustic";


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

export async function getCatalog({
  account_id,
  provider,
}: {
  account_id?: string;
  provider?: string;
}): Promise<HostCatalog> {
  requireAccount(account_id);
  const cloud = provider ?? "gcp";
  const { rows } = await pool().query(
    `SELECT kind, scope, payload
       FROM cloud_catalog_cache
      WHERE provider=$1`,
    [cloud],
  );

  const catalog: HostCatalog = {
    provider: cloud,
    regions: [],
    zones: [],
    machine_types_by_zone: {},
    gpu_types_by_zone: {},
    images: [],
    hyperstack_regions: [],
    hyperstack_flavors: [],
    hyperstack_images: [],
    hyperstack_stocks: [],
  };

  for (const row of rows) {
    if (row.kind === "regions" && row.scope === "global") {
      if (cloud === "hyperstack") {
        catalog.hyperstack_regions = row.payload ?? [];
      } else {
        catalog.regions = row.payload ?? [];
      }
    } else if (row.kind === "zones" && row.scope === "global") {
      catalog.zones = row.payload ?? [];
    } else if (row.kind === "machine_types" && row.scope?.startsWith("zone/")) {
      const zone = row.scope.slice("zone/".length);
      catalog.machine_types_by_zone[zone] = row.payload ?? [];
    } else if (row.kind === "gpu_types" && row.scope?.startsWith("zone/")) {
      const zone = row.scope.slice("zone/".length);
      catalog.gpu_types_by_zone[zone] = row.payload ?? [];
    } else if (row.kind === "images" && row.scope === "global") {
      if (cloud === "hyperstack") {
        catalog.hyperstack_images = row.payload ?? [];
      } else {
        catalog.images = row.payload ?? [];
      }
    } else if (row.kind === "flavors" && row.scope === "global") {
      const payload = row.payload ?? [];
      const flat: HostCatalog["hyperstack_flavors"] = [];
      for (const entry of payload) {
        const region = entry?.region_name;
        const flavors = entry?.flavors ?? [];
        for (const flavor of flavors) {
          if (!flavor?.name) continue;
          flat.push({
            name: flavor.name,
            region_name: region ?? flavor.region_name,
            cpu: flavor.cpu,
            ram: flavor.ram,
            gpu: flavor.gpu,
            gpu_count: flavor.gpu_count,
          });
        }
      }
      catalog.hyperstack_flavors = flat;
    } else if (row.kind === "stocks" && row.scope === "global") {
      const stocks = row.payload ?? [];
      const flat: HostCatalog["hyperstack_stocks"] = [];
      for (const stock of stocks) {
        const region = stock?.region;
        const models = stock?.models ?? [];
        for (const model of models) {
          flat.push({
            region,
            model: model?.model,
            available: model?.available,
          });
        }
      }
      catalog.hyperstack_stocks = flat;
    }
  }

  return catalog;
}

export async function updateCloudCatalog({
  account_id,
  provider,
}: {
  account_id?: string;
  provider?: string;
}): Promise<void> {
  const owner = requireAccount(account_id);
  if (!(await isAdmin(owner))) {
    throw new Error("not authorized");
  }
  await refreshCloudCatalogNow({ provider });
}

export async function getHostLog({
  account_id,
  id,
  limit,
}: {
  account_id?: string;
  id: string;
  limit?: number;
}): Promise<
  {
    id: string;
    vm_id: string;
    ts?: string | null;
    action: string;
    status: string;
    provider?: string | null;
    error?: string | null;
  }[]
> {
  await loadHostForView(id, account_id);
  const entries = await listCloudVmLog({ vm_id: id, limit });
  return entries.map((entry) => ({
    id: entry.id,
    vm_id: entry.vm_id,
    ts: entry.ts ? entry.ts.toISOString() : null,
    action: entry.action,
    status: entry.status,
    provider: entry.provider ?? null,
    error: entry.error ?? null,
  }));
}

export async function getBackupConfig({
  account_id,
  host_id,
}: {
  account_id?: string;
  host_id: string;
}): Promise<{ toml: string; ttl_seconds: number }> {
  if (account_id) {
    throw new Error("not authorized");
  }
  if (!isValidUUID(host_id)) {
    throw new Error("invalid host_id");
  }
  const { rows } = await pool().query<{
    region: string | null;
  }>("SELECT region FROM project_hosts WHERE id=$1", [host_id]);
  if (!rows[0]) {
    throw new Error("host not found");
  }

  const accountId = await getSiteSetting("r2_account_id");
  const accessKey = await getSiteSetting("r2_access_key_id");
  const secretKey = await getSiteSetting("r2_secret_access_key");
  const bucketPrefix = await getSiteSetting("r2_bucket_prefix");
  if (!accountId || !accessKey || !secretKey || !bucketPrefix) {
    return { toml: "", ttl_seconds: 0 };
  }

  const region = rows[0]?.region || "global";
  const bucket = `${bucketPrefix}-${region}`;
  const root = `${DEFAULT_BACKUP_ROOT}/host-${host_id}`;

  const toml = [
    "[repository]",
    "repository = \"opendal:s3\"",
    "password = \"\"",
    "",
    "[repository.options]",
    `endpoint = \"https://${accountId}.r2.cloudflarestorage.com\"`,
    "region = \"auto\"",
    `bucket = \"${bucket}\"`,
    `root = \"${root}\"`,
    `access_key_id = \"${accessKey}\"`,
    `secret_access_key = \"${secretKey}\"`,
    "",
  ].join("\n");

  return { toml, ttl_seconds: DEFAULT_BACKUP_TTL_SECONDS };
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
