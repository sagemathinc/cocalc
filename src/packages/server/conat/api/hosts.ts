import { randomUUID } from "crypto";
import type {
  Host,
  HostMachine,
  HostStatus,
  HostCatalog,
  HostSoftwareUpgradeTarget,
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
  logCloudVmEvent,
  refreshCloudCatalogNow,
  deleteHostDns,
  hasDns,
} from "@cocalc/server/cloud";
import { sendSelfHostCommand } from "@cocalc/server/self-host/commands";
import isAdmin from "@cocalc/server/accounts/is-admin";
import { isValidUUID } from "@cocalc/util/misc";
import { normalizeProviderId, type ProviderId } from "@cocalc/cloud";
import {
  gcpSafeName,
  getProviderPrefix,
  getServerProvider,
  listServerProviders,
} from "@cocalc/server/cloud/providers";
import { getProviderContext } from "@cocalc/server/cloud/provider-context";
import { createHostControlClient } from "@cocalc/conat/project-host/api";
import { conatWithProjectRouting } from "@cocalc/server/conat/route-client";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { revokeBootstrapTokensForHost } from "@cocalc/server/project-host/bootstrap-token";
import {
  createConnectorRecord,
  ensureConnectorRecord,
  revokeConnector,
} from "@cocalc/server/self-host/connector-tokens";
import {
  deleteCloudflareTunnel,
  hasCloudflareTunnel,
} from "@cocalc/server/cloud/cloudflare-tunnel";
function pool() {
  return getPool();
}

const SELF_HOST_RESIZE_TIMEOUT_MS = 5 * 60 * 1000;

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
  const software = metadata.software ?? {};
  const machine: HostMachine | undefined = metadata.machine;
  return {
    id: row.id,
    name: row.name ?? "Host",
    owner: metadata.owner ?? "",
    region: row.region ?? "",
    size: metadata.size ?? "",
    gpu: !!metadata.gpu,
    status: (row.status as HostStatus) ?? "off",
    version: row.version ?? software.project_host,
    project_bundle_version: software.project_bundle,
    tools_version: software.tools,
    machine,
    public_ip: metadata.runtime?.public_ip,
    last_error: metadata.last_error,
    last_error_at: metadata.last_error_at,
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
    deleted: row.deleted ? new Date(row.deleted).toISOString() : undefined,
  };
}

async function loadOwnedHost(id: string, account_id?: string): Promise<any> {
  const owner = requireAccount(account_id);
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
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
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
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

async function markHostDeprovisioned(row: any, action: string) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const nextMetadata = { ...(row.metadata ?? {}) };
  delete nextMetadata.runtime;
  delete nextMetadata.dns;
  delete nextMetadata.cloudflare_tunnel;

  await revokeBootstrapTokensForHost(row.id, { purpose: "bootstrap" });
  try {
    if (await hasCloudflareTunnel()) {
      await deleteCloudflareTunnel({
        host_id: row.id,
        tunnel: row.metadata?.cloudflare_tunnel,
      });
    } else if (await hasDns()) {
      await deleteHostDns({ record_id: row.metadata?.dns?.record_id });
    }
  } catch (err) {
    console.warn("force deprovision cleanup failed", err);
  }

  await pool().query(
    `UPDATE project_hosts
       SET status=$2,
           public_url=NULL,
           internal_url=NULL,
           ssh_server=NULL,
           last_seen=$3,
           metadata=$4,
           updated=NOW()
     WHERE id=$1 AND deleted IS NULL`,
    [row.id, "deprovisioned", new Date(), nextMetadata],
  );
  await logCloudVmEvent({
    vm_id: row.id,
    action,
    status: "success",
    provider: normalizeProviderId(machine.cloud) ?? machine.cloud,
    spec: machine,
    runtime,
  });
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
    "SELECT value FROM server_settings WHERE name=$1",
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
  include_deleted,
  catalog,
}: {
  account_id?: string;
  admin_view?: boolean;
  include_deleted?: boolean;
  catalog?: boolean;
}): Promise<Host[]> {
  const owner = requireAccount(account_id);
  if (admin_view && !(await isAdmin(owner))) {
    throw new Error("not authorized");
  }
  const filters: string[] = [];
  const params: any[] = [];
  if (!admin_view) {
    filters.push(`(metadata->>'owner' = $${params.length + 1} OR tier IS NOT NULL)`);
    params.push(owner);
  }
  if (!include_deleted) {
    filters.push("deleted IS NULL");
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts ${whereClause} ORDER BY updated DESC NULLS LAST, created DESC NULLS LAST`,
    params,
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

    const showAll = admin_view || catalog;
    // If catalog=false, filter out what user cannot place
    if (!showAll && !can_place) {
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
  if (cloud === "self-host") {
    const { rows } = await pool().query<{
      connector_id: string;
      name: string | null;
      last_seen: Date | null;
    }>(
      `SELECT connector_id, name, last_seen
         FROM self_host_connectors
        WHERE account_id=$1 AND revoked IS NOT TRUE
        ORDER BY created DESC`,
      [account_id],
    );
    const connectors = rows.map((row) => ({
      id: row.connector_id,
      name: row.name ?? undefined,
      last_seen: row.last_seen ? row.last_seen.toISOString() : undefined,
    }));
    return {
      provider: cloud,
      entries: [
        {
          kind: "connectors",
          scope: "account",
          payload: connectors,
        },
      ],
      provider_capabilities: Object.fromEntries(
        listServerProviders().map((entry) => [
          entry.id,
          entry.entry.capabilities,
        ]),
      ),
    };
  }
  const { rows } = await pool().query(
    `SELECT kind, scope, payload
       FROM cloud_catalog_cache
      WHERE provider=$1`,
    [cloud],
  );

  const catalog: HostCatalog = {
    provider: cloud,
    entries: rows.map((row) => ({
      kind: row.kind,
      scope: row.scope,
      payload: row.payload,
    })),
    provider_capabilities: Object.fromEntries(
      listServerProviders().map((entry) => [
        entry.id,
        entry.entry.capabilities,
      ]),
    ),
  };

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
  await refreshCloudCatalogNow({
    provider: provider as ProviderId | undefined,
  });
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
  }>("SELECT region FROM project_hosts WHERE id=$1 AND deleted IS NULL", [
    host_id,
  ]);
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
  const machineCloud = normalizeProviderId(machine?.cloud);
  const isSelfHost = machineCloud === "self-host";
  const initialStatus = machineCloud && !isSelfHost ? "starting" : "off";
  let resolvedRegion = region;
  let connectorId: string | undefined;
  if (isSelfHost) {
    const connector = await createConnectorRecord({
      account_id: owner,
      host_id: id,
      name,
    });
    connectorId = connector.connector_id;
    resolvedRegion = connectorId;
  }
  await pool().query(
    `INSERT INTO project_hosts (id, name, region, status, metadata, created, updated, last_seen)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6)`,
    [
      id,
      name,
      resolvedRegion,
      initialStatus,
      {
        owner,
        size,
        gpu,
        machine: {
          ...(machine ?? {}),
          ...(machineCloud ? { cloud: machineCloud } : {}),
          ...(connectorId
            ? {
                metadata: {
                  ...(machine?.metadata ?? {}),
                  connector_id: connectorId,
                },
              }
            : {}),
        },
      },
      now,
    ],
  );
  if (machineCloud && !isSelfHost) {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "provision",
      payload: { provider: machineCloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
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
  const owner = metadata.owner ?? account_id;
  const nextMetadata = { ...metadata };
  if (nextMetadata.bootstrap) {
    // bootstrap should be idempotent and we bootstrap on EVERY start
    delete nextMetadata.bootstrap;
  }
  const machine: HostMachine = metadata.machine ?? {};
  const machineCloud = normalizeProviderId(machine.cloud);
  if (machineCloud === "self-host" && row.region && owner) {
    await ensureConnectorRecord({
      connector_id: row.region,
      account_id: owner,
      host_id: row.id,
      name: row.name ?? undefined,
    });
  }
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, metadata=$4, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "starting", new Date(), nextMetadata],
  );
  if (!machineCloud) {
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "running", new Date()],
    );
  } else {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "start",
      payload: { provider: machineCloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
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
  const machineCloud = normalizeProviderId(machine.cloud);
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "stopping", new Date()],
  );
  if (!machineCloud) {
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "off", new Date()],
    );
  } else {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "stop",
      payload: { provider: machineCloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function restartHost({
  account_id,
  id,
  mode,
}: {
  account_id?: string;
  id: string;
  mode?: "reboot" | "hard";
}): Promise<Host> {
  const row = await loadHostForStartStop(id, account_id);
  if (row.status === "deprovisioned") {
    throw new Error("host is not provisioned");
  }
  if (!["running", "active", "error"].includes(row.status)) {
    throw new Error("host must be running to restart");
  }
  const metadata = row.metadata ?? {};
  const owner = metadata.owner ?? account_id;
  const machine: HostMachine = metadata.machine ?? {};
  const machineCloud = normalizeProviderId(machine.cloud);
  const provider = machineCloud ? getServerProvider(machineCloud) : undefined;
  const caps = provider?.entry.capabilities;
  const wantsHard = mode === "hard";
  if (machineCloud && caps) {
    const supported = wantsHard ? caps.supportsHardRestart : caps.supportsRestart;
    if (!supported) {
      throw new Error(
        wantsHard ? "hard reboot is not supported" : "reboot is not supported",
      );
    }
  }
  if (machineCloud === "self-host" && row.region && owner) {
    await ensureConnectorRecord({
      connector_id: row.region,
      account_id: owner,
      host_id: row.id,
      name: row.name ?? undefined,
    });
  }
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "restarting", new Date()],
  );
  if (!machineCloud) {
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "running", new Date()],
    );
  } else {
    await enqueueCloudVmWork({
      vm_id: id,
      action: mode === "hard" ? "hard_restart" : "restart",
      payload: { provider: machineCloud },
    });
  }
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function forceDeprovisionHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  const row = await loadOwnedHost(id, account_id);
  const machineCloud = normalizeProviderId(row.metadata?.machine?.cloud);
  if (machineCloud !== "self-host") {
    throw new Error("force deprovision is only supported for self-hosted VMs");
  }
  await markHostDeprovisioned(row, "force_deprovision");
}

export async function removeSelfHostConnector({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  const row = await loadOwnedHost(id, account_id);
  const machineCloud = normalizeProviderId(row.metadata?.machine?.cloud);
  if (machineCloud !== "self-host") {
    throw new Error("host is not self-hosted");
  }
  await markHostDeprovisioned(row, "remove_connector");
  const connectorId =
    row.region ??
    row.metadata?.machine?.metadata?.connector_id ??
    row.metadata?.machine?.metadata?.connectorId;
  if (typeof connectorId === "string" && connectorId) {
    await revokeConnector({
      connector_id: connectorId,
      account_id,
    });
  }
}

export async function renameHost({
  account_id,
  id,
  name,
}: {
  account_id?: string;
  id: string;
  name: string;
}): Promise<Host> {
  await loadOwnedHost(id, account_id);
  const cleaned = name?.trim();
  if (!cleaned) {
    throw new Error("name must be provided");
  }
  await pool().query(
    `UPDATE project_hosts SET name=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, cleaned],
  );
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function updateHostMachine({
  account_id,
  id,
  cpu,
  ram_gb,
  disk_gb,
  disk_type,
  machine_type,
  gpu_type,
  gpu_count,
  storage_mode,
  boot_disk_gb,
  region,
  zone,
}: {
  account_id?: string;
  id: string;
  cpu?: number;
  ram_gb?: number;
  disk_gb?: number;
  disk_type?: HostMachine["disk_type"];
  machine_type?: HostMachine["machine_type"];
  gpu_type?: HostMachine["gpu_type"];
  gpu_count?: number;
  storage_mode?: HostMachine["storage_mode"];
  boot_disk_gb?: number;
  region?: string;
  zone?: string;
}): Promise<Host> {
  const row = await loadOwnedHost(id, account_id);
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  const machineCloud = normalizeProviderId(machine.cloud);
  const isSelfHost = machineCloud === "self-host";
  const isDeprovisioned = row.status === "deprovisioned";
  const nextMachine: HostMachine = {
    ...machine,
    metadata: { ...(machine.metadata ?? {}) },
  };
  let changed = false;
  let nonDiskChange = false;
  let nextRegion = row.region ?? "";

  const parsePositiveInt = (value: unknown, label: string) => {
    if (value == null) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive number`);
    }
    return Math.floor(parsed);
  };

  const nextCpu = parsePositiveInt(cpu, "cpu");
  const nextRam = parsePositiveInt(ram_gb, "ram_gb");
  const nextDisk = parsePositiveInt(disk_gb, "disk_gb");
  const nextGpuCount = parsePositiveInt(gpu_count, "gpu_count");
  const nextBootDisk = parsePositiveInt(boot_disk_gb, "boot_disk_gb");

  if (nextCpu != null && nextCpu !== machine.metadata?.cpu) {
    nextMachine.metadata = { ...(nextMachine.metadata ?? {}), cpu: nextCpu };
    changed = true;
    nonDiskChange = true;
  }
  if (nextRam != null && nextRam !== machine.metadata?.ram_gb) {
    nextMachine.metadata = { ...(nextMachine.metadata ?? {}), ram_gb: nextRam };
    changed = true;
    nonDiskChange = true;
  }
  if (nextDisk != null) {
    const currentDisk = Number(machine.disk_gb);
    if (
      !isDeprovisioned &&
      Number.isFinite(currentDisk) &&
      currentDisk > 0 &&
      nextDisk < currentDisk
    ) {
      throw new Error("disk size can only increase");
    }
    if (nextDisk !== machine.disk_gb) {
      nextMachine.disk_gb = nextDisk;
      changed = true;
    }
  }
  if (typeof machine_type === "string" && machine_type !== machine.machine_type) {
    nextMachine.machine_type = machine_type || undefined;
    changed = true;
    nonDiskChange = true;
  }
  if (typeof gpu_type === "string" && gpu_type !== machine.gpu_type) {
    nextMachine.gpu_type = gpu_type || undefined;
    changed = true;
    nonDiskChange = true;
  }
  if (nextGpuCount != null && nextGpuCount !== machine.gpu_count) {
    nextMachine.gpu_count = nextGpuCount;
    changed = true;
    nonDiskChange = true;
  }
  if (typeof storage_mode === "string" && storage_mode !== machine.storage_mode) {
    nextMachine.storage_mode = storage_mode;
    changed = true;
    nonDiskChange = true;
  }
  if (typeof disk_type === "string" && disk_type !== machine.disk_type) {
    nextMachine.disk_type = disk_type;
    changed = true;
    nonDiskChange = true;
  }
  if (nextBootDisk != null && nextBootDisk !== machine.metadata?.boot_disk_gb) {
    nextMachine.metadata = {
      ...(nextMachine.metadata ?? {}),
      boot_disk_gb: nextBootDisk,
    };
    changed = true;
    nonDiskChange = true;
  }
  if (typeof zone === "string" && zone && zone !== machine.zone) {
    nextMachine.zone = zone;
    changed = true;
    nonDiskChange = true;
  }
  if (typeof region === "string" && region && region !== row.region) {
    nextRegion = region;
    changed = true;
    nonDiskChange = true;
  }

  if (!changed) {
    return parseRow(row);
  }

  if (isDeprovisioned) {
    const nextMetadata = { ...metadata, machine: nextMachine };
    if (machine_type) {
      nextMetadata.size = machine_type;
    }
    const gpuEnabled =
      (nextMachine.gpu_type && nextMachine.gpu_type !== "none") ||
      ((nextMachine.gpu_count ?? 0) > 0 && nextMachine.gpu_type !== "none");
    nextMetadata.gpu = gpuEnabled;
    await pool().query(
      `UPDATE project_hosts SET region=$2, metadata=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [row.id, nextRegion, nextMetadata],
    );
    const { rows } = await pool().query(
      `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
      [row.id],
    );
    if (!rows[0]) throw new Error("host not found");
    return parseRow(rows[0]);
  }

  if (machineCloud && !isSelfHost && nonDiskChange) {
    throw new Error(
      "host must be deprovisioned before changing CPU/RAM/machine type",
    );
  }

  if (!isSelfHost && nextDisk == null) {
    return parseRow(row);
  }

  let resizeWarning: string | undefined;
  let runtime = metadata.runtime ?? {};
  if (!runtime.instance_id && machineCloud === "gcp") {
    const zone = runtime.zone ?? nextMachine.zone ?? machine.zone ?? undefined;
    if (zone) {
      const prefix = getProviderPrefix(machineCloud, await getServerSettings());
      const provider = getServerProvider(machineCloud);
      const normalizeName = provider?.normalizeName ?? gcpSafeName;
      const baseName = row.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      runtime = {
        ...runtime,
        instance_id: normalizeName(prefix, baseName),
        zone,
      };
    }
  }
  const instanceName =
    runtime.metadata?.instance_name ?? runtime.instance_id ?? undefined;
  if (isSelfHost) {
    const connectorId =
      row.region ??
      machine.metadata?.connector_id ??
      machine.metadata?.connectorId ??
      undefined;
    if (connectorId && instanceName) {
      const payload: Record<string, any> = {
        host_id: row.id,
        name: instanceName,
      };
      if (nextCpu != null) payload.cpus = nextCpu;
      if (nextRam != null) payload.mem_gb = nextRam;
      if (nextDisk != null) payload.disk_gb = nextDisk;
      await sendSelfHostCommand({
        connector_id: connectorId,
        action: "resize",
        payload,
        timeoutMs: SELF_HOST_RESIZE_TIMEOUT_MS,
      });
    }
  } else if (machineCloud && nextDisk != null) {
    const provider = getServerProvider(machineCloud);
    if (!provider?.entry.capabilities.supportsDiskResize) {
      throw new Error("disk resize is not supported for this provider");
    }
    const diskResizeRequiresStop = (
      provider.entry.capabilities as { diskResizeRequiresStop?: boolean }
    ).diskResizeRequiresStop;
    if (nextMachine.storage_mode === "ephemeral") {
      throw new Error("disk resize is only available for persistent storage");
    }
    if (diskResizeRequiresStop && row.status !== "off") {
      throw new Error("disk resize requires the host to be stopped");
    }
    if (!runtime.instance_id) {
      throw new Error("host is not provisioned");
    }
    const { entry, creds } = await getProviderContext(machineCloud);
    await entry.provider.resizeDisk(runtime, nextDisk, creds);
    if (row.status !== "off") {
      const client = createHostControlClient({
        host_id: row.id,
        client: conatWithProjectRouting(),
      });
      try {
        await client.growBtrfs({ disk_gb: nextDisk });
      } catch (err) {
        resizeWarning =
          "disk resized in cloud, but filesystem resize failed; reboot or run /usr/local/sbin/cocalc-grow-btrfs";
        console.warn("growBtrfs failed after disk resize", err);
      }
    }
  }

  const nextMetadata = {
    ...metadata,
    machine: nextMachine,
    ...(resizeWarning
      ? {
          last_action: "resize_disk",
          last_action_status: `warning: ${resizeWarning}`,
          last_action_error: resizeWarning,
          last_action_at: new Date().toISOString(),
        }
      : {}),
  };
  await pool().query(
    `UPDATE project_hosts SET region=$2, metadata=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [row.id, nextRegion, nextMetadata],
  );
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [row.id],
  );
  if (!rows[0]) throw new Error("host not found");
  return parseRow(rows[0]);
}

export async function upgradeHostSoftware({
  account_id,
  id,
  targets,
  base_url,
}: {
  account_id?: string;
  id: string;
  targets: HostSoftwareUpgradeTarget[];
  base_url?: string;
}) {
  await loadHostForStartStop(id, account_id);
  const { project_hosts_software_base_url } = await getServerSettings();
  const resolvedBaseUrl =
    base_url ??
    project_hosts_software_base_url ??
    process.env.COCALC_PROJECT_HOST_SOFTWARE_BASE_URL ??
    undefined;
  const client = createHostControlClient({
    host_id: id,
    client: conatWithProjectRouting(),
  });
  return await client.upgradeSoftware({
    targets,
    base_url: resolvedBaseUrl,
  });
}

export async function deleteHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  const row = await loadOwnedHost(id, account_id);
  if (row.status === "deprovisioned") {
    await pool().query(
      `UPDATE project_hosts SET deleted=NOW(), updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id],
    );
    return;
  }
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  const machineCloud = normalizeProviderId(machine.cloud);
  if (machineCloud) {
    await enqueueCloudVmWork({
      vm_id: id,
      action: "delete",
      payload: { provider: machineCloud },
    });
    await pool().query(
      `UPDATE project_hosts SET status=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "stopping"],
    );
    return;
  }
  await pool().query(
    `UPDATE project_hosts SET status=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "deprovisioned"],
  );
}
