import { randomUUID } from "crypto";
import type {
  Host,
  HostBackupStatus,
  HostMachine,
  HostStatus,
  HostCatalog,
  HostSoftwareUpgradeTarget,
  HostSoftwareUpgradeResponse,
  HostLroResponse,
  HostLroKind,
  HostProjectRow,
  HostProjectsResponse,
} from "@cocalc/conat/hub/api/hosts";
import type { ProjectCopyRow, ProjectCopyState } from "@cocalc/conat/hub/api/projects";
import getLogger from "@cocalc/backend/logger";
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
  claimPendingCopies as claimPendingCopiesDb,
  updateCopyStatus as updateCopyStatusDb,
} from "@cocalc/server/projects/copy-db";
import { createLro } from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { lroStreamName } from "@cocalc/conat/lro/names";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";
import {
  machineHasGpu,
  normalizeMachineGpuInPlace,
} from "@cocalc/server/cloud/host-gpu";
import {
  createConnectorRecord,
  ensureConnectorRecord,
  revokeConnector,
} from "@cocalc/server/self-host/connector-tokens";
import {
  deleteCloudflareTunnel,
  hasCloudflareTunnel,
} from "@cocalc/server/cloud/cloudflare-tunnel";
import { requireLaunchpadModeSelected } from "@cocalc/server/launchpad/mode";
function pool() {
  return getPool();
}

const SELF_HOST_RESIZE_TIMEOUT_MS = 5 * 60 * 1000;
const HOST_START_LRO_KIND = "host-start";
const HOST_STOP_LRO_KIND = "host-stop";
const HOST_RESTART_LRO_KIND = "host-restart";
const HOST_UPGRADE_LRO_KIND = "host-upgrade-software";
const HOST_DEPROVISION_LRO_KIND = "host-deprovision";
const HOST_DELETE_LRO_KIND = "host-delete";
const HOST_FORCE_DEPROVISION_LRO_KIND = "host-force-deprovision";
const HOST_REMOVE_CONNECTOR_LRO_KIND = "host-remove-connector";
const logger = getLogger("server:conat:api:hosts");

const HOST_PROJECTS_DEFAULT_LIMIT = 200;
const HOST_PROJECTS_MAX_LIMIT = 5000;

function logStatusUpdate(id: string, status: string, source: string) {
  const stack = new Error().stack;
  logger.debug("status update", {
    host_id: id,
    status,
    source,
    stack,
  });
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
    backup_status?: HostBackupStatus;
  } = {},
): Host {
  const metadata = row.metadata ?? {};
  const software = metadata.software ?? {};
  const machine: HostMachine | undefined = metadata.machine;
  const rawStatus = String(row.status ?? "");
  const normalizedStatus =
    rawStatus === "active" ? "running" : (rawStatus || "off");
  return {
    id: row.id,
    name: row.name ?? "Host",
    owner: metadata.owner ?? "",
    region: row.region ?? "",
    size: metadata.size ?? "",
    gpu: !!metadata.gpu,
    status: normalizedStatus as HostStatus,
    reprovision_required: !!metadata.reprovision_required,
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
    provider_observed_at: metadata.runtime?.observed_at,
    deleted: row.deleted ? new Date(row.deleted).toISOString() : undefined,
    backup_status: opts.backup_status,
  };
}

async function loadHostBackupStatus(
  hostIds: string[],
): Promise<Map<string, HostBackupStatus>> {
  if (!hostIds.length) return new Map();
  const { rows } = await pool().query<{
    host_id: string;
    total: string;
    provisioned: string;
    running: string;
    provisioned_up_to_date: string;
    provisioned_needs_backup: string;
  }>(
    `
      SELECT
        host_id,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE provisioned IS TRUE) AS provisioned,
        COUNT(*) FILTER (
          WHERE COALESCE(state->>'state', '') IN ('running','starting')
        ) AS running,
        COUNT(*) FILTER (
          WHERE provisioned IS TRUE
            AND COALESCE(state->>'state', '') NOT IN ('running','starting')
            AND last_backup IS NOT NULL
            AND (last_edited IS NULL OR last_edited <= last_backup)
        ) AS provisioned_up_to_date,
        COUNT(*) FILTER (
          WHERE provisioned IS TRUE
            AND COALESCE(state->>'state', '') NOT IN ('running','starting')
            AND (
              last_backup IS NULL
              OR (last_edited IS NOT NULL AND last_edited > last_backup)
            )
        ) AS provisioned_needs_backup
      FROM projects
      WHERE deleted IS NOT true
        AND host_id = ANY($1)
      GROUP BY host_id
    `,
    [hostIds],
  );
  const map = new Map<string, HostBackupStatus>();
  for (const row of rows) {
    map.set(row.host_id, {
      total: Number(row.total ?? 0),
      provisioned: Number(row.provisioned ?? 0),
      running: Number(row.running ?? 0),
      provisioned_up_to_date: Number(row.provisioned_up_to_date ?? 0),
      provisioned_needs_backup: Number(row.provisioned_needs_backup ?? 0),
    });
  }
  return map;
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

async function loadHostForListing(
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
  if (await isAdmin(owner)) {
    return row;
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

type HostProjectsCursor = {
  last_edited: string | null;
  project_id: string;
};

function encodeHostProjectsCursor(cursor: HostProjectsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeHostProjectsCursor(cursor: string): HostProjectsCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf8"),
    ) as HostProjectsCursor;
    if (!parsed?.project_id) {
      throw new Error("missing project_id");
    }
    return {
      project_id: String(parsed.project_id),
      last_edited:
        parsed.last_edited == null ? null : String(parsed.last_edited),
    };
  } catch (err) {
    throw new Error(`invalid cursor: ${err}`);
  }
}

function normalizeHostProjectsLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return HOST_PROJECTS_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(HOST_PROJECTS_MAX_LIMIT, Math.floor(limit)));
}

function normalizeDate(value: any): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

async function markHostActionPending(id: string, action: string) {
  await pool().query(
    `
      UPDATE project_hosts
      SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{last_action}', to_jsonb($2::text)
            ),
            '{last_action_at}', to_jsonb(NOW())
          ),
          '{last_action_status}', to_jsonb('pending'::text)
        ),
        '{last_action_error}', 'null'::jsonb
      ),
      updated=NOW()
      WHERE id=$1 AND deleted IS NULL
    `,
    [id, action],
  );
}

async function markHostDeprovisioned(row: any, action: string) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const nextMetadata = { ...(row.metadata ?? {}) };
  delete nextMetadata.runtime;
  delete nextMetadata.dns;
  delete nextMetadata.cloudflare_tunnel;

  logStatusUpdate(row.id, "deprovisioned", "api");
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

export { getBackupConfig, recordProjectBackup } from "@cocalc/server/project-backup";

export async function touchProject({
  host_id,
  project_id,
}: {
  host_id?: string;
  project_id: string;
}): Promise<void> {
  if (!host_id) {
    throw new Error("host_id must be specified");
  }
  if (!project_id) {
    throw new Error("project_id must be specified");
  }
  const { rowCount } = await pool().query(
    `
      UPDATE projects
      SET last_edited=NOW()
      WHERE project_id=$1
        AND host_id=$2
        AND deleted IS NOT true
    `,
    [project_id, host_id],
  );
  if (!rowCount) {
    logger.debug("touchProject ignored (host mismatch)", {
      host_id,
      project_id,
    });
  }
}

export async function claimPendingCopies({
  host_id,
  project_id,
  limit,
}: {
  host_id?: string;
  project_id?: string;
  limit?: number;
}): Promise<ProjectCopyRow[]> {
  if (!host_id) {
    throw new Error("host_id must be specified");
  }
  return await claimPendingCopiesDb({ host_id, project_id, limit });
}

export async function updateCopyStatus({
  host_id,
  src_project_id,
  src_path,
  dest_project_id,
  dest_path,
  status,
  last_error,
}: {
  host_id?: string;
  src_project_id: string;
  src_path: string;
  dest_project_id: string;
  dest_path: string;
  status: ProjectCopyState;
  last_error?: string;
}): Promise<void> {
  if (!host_id) {
    throw new Error("host_id must be specified");
  }
  await updateCopyStatusDb({
    key: { src_project_id, src_path, dest_project_id, dest_path },
    status,
    last_error,
  });
}

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
  const backupStatus = await loadHostBackupStatus(rows.map((row) => row.id));

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
        backup_status: backupStatus.get(row.id),
      }),
    );
  }
  return result;
}

export async function listHostProjects({
  account_id,
  id,
  limit,
  cursor,
  risk_only,
}: {
  account_id?: string;
  id: string;
  limit?: number;
  cursor?: string;
  risk_only?: boolean;
}): Promise<HostProjectsResponse> {
  const host = await loadHostForListing(id, account_id);
  const cappedLimit = normalizeHostProjectsLimit(limit);
  const needsBackupSql = `
    COALESCE(state->>'state', '') IN ('running','starting')
    OR (
      provisioned IS TRUE
      AND (
        last_backup IS NULL
        OR (last_edited IS NOT NULL AND last_edited > last_backup)
      )
    )
  `;

  const params: any[] = [id];
  const filters: string[] = ["deleted IS NOT true", "host_id = $1"];

  if (risk_only) {
    filters.push(`(${needsBackupSql})`);
  }

  if (cursor) {
    const decoded = decodeHostProjectsCursor(cursor);
    const cursorDate =
      decoded.last_edited == null ? new Date(0) : new Date(decoded.last_edited);
    if (Number.isNaN(cursorDate.valueOf())) {
      throw new Error("invalid cursor timestamp");
    }
    params.push(cursorDate);
    params.push(decoded.project_id);
    filters.push(
      `(COALESCE(last_edited, to_timestamp(0)) < $${
        params.length - 1
      } OR (COALESCE(last_edited, to_timestamp(0)) = $${
        params.length - 1
      } AND project_id < $${params.length}))`,
    );
  }

  params.push(cappedLimit + 1);
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await pool().query<{
    project_id: string;
    title: string | null;
    state: string | null;
    provisioned: boolean | null;
    last_edited: Date | null;
    last_backup: Date | null;
    needs_backup: boolean;
    collab_count: string;
  }>(
    `
      SELECT
        project_id,
        LEFT(COALESCE(title, ''), 80) AS title,
        COALESCE(state->>'state', '') AS state,
        provisioned,
        last_edited,
        last_backup,
        (${needsBackupSql}) AS needs_backup,
        COALESCE(
          (
            SELECT COUNT(*)
            FROM jsonb_object_keys(COALESCE(users::jsonb, '{}'::jsonb))
          ),
          0
        ) AS collab_count
      FROM projects
      ${whereClause}
      ORDER BY COALESCE(last_edited, to_timestamp(0)) DESC, project_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  let next_cursor: string | undefined;
  let trimmed = rows;
  if (rows.length > cappedLimit) {
    trimmed = rows.slice(0, cappedLimit);
    const last = trimmed[trimmed.length - 1];
    next_cursor = encodeHostProjectsCursor({
      project_id: last.project_id,
      last_edited: normalizeDate(last.last_edited),
    });
  }

  const summaryMap = await loadHostBackupStatus([id]);
  const summary =
    summaryMap.get(id) ?? {
      total: 0,
      provisioned: 0,
      running: 0,
      provisioned_up_to_date: 0,
      provisioned_needs_backup: 0,
    };

  const resultRows: HostProjectRow[] = trimmed.map((row) => ({
    project_id: row.project_id,
    title: row.title ?? "",
    state: row.state ?? "",
    provisioned: row.provisioned ?? null,
    last_edited: normalizeDate(row.last_edited),
    last_backup: normalizeDate(row.last_backup),
    needs_backup: !!row.needs_backup,
    collab_count: Number(row.collab_count ?? 0),
  }));

  return {
    rows: resultRows,
    summary,
    next_cursor,
    host_last_seen: normalizeDate(host.last_seen) ?? undefined,
  };
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
    spec?: Record<string, any> | null;
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
    spec: entry.spec ?? null,
    error: entry.error ?? null,
  }));
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
  await requireLaunchpadModeSelected();
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
  const normalizedMachine = normalizeMachineGpuInPlace(
    {
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
    gpu,
  );
  const gpuEnabled = machineHasGpu(normalizedMachine);

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
        gpu: gpuEnabled,
        machine: normalizedMachine,
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

async function createHostLro({
  kind,
  row,
  account_id,
  input,
  dedupe_key,
}: {
  kind: HostLroKind;
  row: { id: string };
  account_id?: string;
  input: any;
  dedupe_key?: string;
}): Promise<HostLroResponse> {
  await requireLaunchpadModeSelected();
  const op = await createLro({
    kind,
    scope_type: "host",
    scope_id: row.id,
    created_by: account_id,
    routing: "hub",
    input,
    dedupe_key,
    status: "queued",
  });
  await publishLroSummary({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    summary: op,
  });
  publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: "queued",
      message: "queued",
      progress: 0,
      detail: input,
    },
  }).catch(() => {});
  return {
    op_id: op.op_id,
    scope_type: "host",
    scope_id: row.id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
    kind,
  };
}

export async function startHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<HostLroResponse> {
  const row = await loadHostForStartStop(id, account_id);
  return await createHostLro({
    kind: HOST_START_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id },
    dedupe_key: `${HOST_START_LRO_KIND}:${row.id}`,
  });
}

export async function startHostInternal({
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
  logStatusUpdate(id, "starting", "api");
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, metadata=$4, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "starting", null, nextMetadata],
  );
  if (!machineCloud) {
    logStatusUpdate(id, "running", "api");
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "running", new Date()],
    );
  } else {
    await markHostActionPending(id, "start");
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
  skip_backups,
}: {
  account_id?: string;
  id: string;
  skip_backups?: boolean;
}): Promise<HostLroResponse> {
  const row = await loadHostForStartStop(id, account_id);
  return await createHostLro({
    kind: HOST_STOP_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id, skip_backups: !!skip_backups },
    dedupe_key: `${HOST_STOP_LRO_KIND}:${row.id}`,
  });
}

export async function stopHostInternal({
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
  logStatusUpdate(id, "stopping", "api");
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "stopping", null],
  );
  if (!machineCloud) {
    logStatusUpdate(id, "off", "api");
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "off", null],
    );
  } else {
    await markHostActionPending(id, "stop");
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
}): Promise<HostLroResponse> {
  const row = await loadHostForStartStop(id, account_id);
  return await createHostLro({
    kind: HOST_RESTART_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id, mode },
    dedupe_key: `${HOST_RESTART_LRO_KIND}:${row.id}:${mode ?? "reboot"}`,
  });
}

export async function restartHostInternal({
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
  if (!["running", "error"].includes(row.status)) {
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
  logStatusUpdate(id, "restarting", "api");
  await pool().query(
    `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "restarting", null],
  );
  if (!machineCloud) {
    logStatusUpdate(id, "running", "api");
    await pool().query(
      `UPDATE project_hosts SET status=$2, last_seen=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "running", new Date()],
    );
  } else {
    await markHostActionPending(id, mode === "hard" ? "hard_restart" : "restart");
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
}): Promise<HostLroResponse> {
  const row = await loadOwnedHost(id, account_id);
  const machineCloud = normalizeProviderId(row.metadata?.machine?.cloud);
  if (machineCloud !== "self-host") {
    throw new Error("force deprovision is only supported for self-hosted VMs");
  }
  return await createHostLro({
    kind: HOST_FORCE_DEPROVISION_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id },
    dedupe_key: `${HOST_FORCE_DEPROVISION_LRO_KIND}:${row.id}`,
  });
}

export async function forceDeprovisionHostInternal({
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
}): Promise<HostLroResponse> {
  const row = await loadOwnedHost(id, account_id);
  const machineCloud = normalizeProviderId(row.metadata?.machine?.cloud);
  if (machineCloud !== "self-host") {
    throw new Error("host is not self-hosted");
  }
  return await createHostLro({
    kind: HOST_REMOVE_CONNECTOR_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id },
    dedupe_key: `${HOST_REMOVE_CONNECTOR_LRO_KIND}:${row.id}`,
  });
}

export async function removeSelfHostConnectorInternal({
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
  const row = await loadOwnedHost(id, account_id);
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
  await logCloudVmEvent({
    vm_id: id,
    action: "rename",
    status: "success",
    provider: normalizeProviderId(row?.metadata?.machine?.cloud),
    spec: { before: { name: row?.name ?? null }, after: { name: cleaned } },
  });
  return parseRow(rows[0]);
}

export async function updateHostMachine({
  account_id,
  id,
  cloud,
  cpu,
  ram_gb,
  disk_gb,
  disk_type,
  machine_type,
  gpu_type,
  gpu_count,
  storage_mode,
  region,
  zone,
}: {
  account_id?: string;
  id: string;
  cloud?: HostMachine["cloud"];
  cpu?: number;
  ram_gb?: number;
  disk_gb?: number;
  disk_type?: HostMachine["disk_type"];
  machine_type?: HostMachine["machine_type"];
  gpu_type?: HostMachine["gpu_type"];
  gpu_count?: number;
  storage_mode?: HostMachine["storage_mode"];
  region?: string;
  zone?: string;
}): Promise<Host> {
  const row = await loadOwnedHost(id, account_id);
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  const machineCloud = normalizeProviderId(machine.cloud);
  const isSelfHost = machineCloud === "self-host";
  const isDeprovisioned = row.status === "deprovisioned";
  let nextMachine: HostMachine = {
    ...machine,
    metadata: { ...(machine.metadata ?? {}) },
  };
  let changed = false;
  let nonDiskChange = false;
  let regionChanged = false;
  let zoneChanged = false;
  let storageModeChanged = false;
  let diskTypeChanged = false;
  let machineChanged = false;
  let nextRegion = row.region ?? "";
  const requestedCloudRaw = typeof cloud === "string" ? cloud : undefined;
  const requestedCloud = normalizeProviderId(requestedCloudRaw);
  const cloudChanged =
    requestedCloudRaw !== undefined && requestedCloud !== machineCloud;
  const buildConfigSpec = (
    specMachine: HostMachine,
    regionValue: string | null | undefined,
  ) => ({
    cloud: normalizeProviderId(specMachine.cloud) ?? specMachine.cloud ?? null,
    name: row.name ?? null,
    region: regionValue ?? null,
    zone: specMachine.zone ?? null,
    machine_type: specMachine.machine_type ?? null,
    gpu_type: specMachine.gpu_type ?? null,
    gpu_count: specMachine.gpu_count ?? null,
    cpu: specMachine.metadata?.cpu ?? null,
    ram_gb: specMachine.metadata?.ram_gb ?? null,
    disk_gb: specMachine.disk_gb ?? null,
    disk_type: specMachine.disk_type ?? null,
    storage_mode: specMachine.storage_mode ?? null,
  });
  const beforeSpec = buildConfigSpec(machine, row.region);

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

  if (cloudChanged) {
    if (!isDeprovisioned) {
      throw new Error("provider can only be changed when deprovisioned");
    }
    nextMachine = {
      cloud: requestedCloud,
      metadata: {},
    };
    changed = true;
    nonDiskChange = true;
    machineChanged = true;
    storageModeChanged = true;
    diskTypeChanged = true;
  }

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
    if (nextDisk !== nextMachine.disk_gb) {
      nextMachine.disk_gb = nextDisk;
      changed = true;
    }
  }
  if (
    typeof machine_type === "string" &&
    machine_type !== nextMachine.machine_type
  ) {
    nextMachine.machine_type = machine_type || undefined;
    changed = true;
    nonDiskChange = true;
    machineChanged = true;
  }
  if (typeof gpu_type === "string" && gpu_type !== nextMachine.gpu_type) {
    if (gpu_type === "none") {
      nextMachine.gpu_type = undefined;
      nextMachine.gpu_count = 0;
    } else {
      nextMachine.gpu_type = gpu_type || undefined;
    }
    changed = true;
    nonDiskChange = true;
    machineChanged = true;
  }
  if (nextGpuCount != null && nextGpuCount !== nextMachine.gpu_count) {
    nextMachine.gpu_count = nextGpuCount;
    changed = true;
    nonDiskChange = true;
    machineChanged = true;
  }
  if (
    typeof storage_mode === "string" &&
    storage_mode !== nextMachine.storage_mode
  ) {
    nextMachine.storage_mode = storage_mode;
    changed = true;
    nonDiskChange = true;
    storageModeChanged = true;
  }
  if (typeof disk_type === "string" && disk_type !== nextMachine.disk_type) {
    nextMachine.disk_type = disk_type;
    changed = true;
    nonDiskChange = true;
    diskTypeChanged = true;
  }
  if (typeof zone === "string" && zone && zone !== nextMachine.zone) {
    nextMachine.zone = zone;
    changed = true;
    nonDiskChange = true;
    zoneChanged = true;
  }
  if (typeof region === "string" && region && region !== row.region) {
    nextRegion = region;
    changed = true;
    nonDiskChange = true;
    regionChanged = true;
  }

  if (!changed) {
    return parseRow(row);
  }

  normalizeMachineGpuInPlace(nextMachine);

  if (isDeprovisioned) {
    const nextMetadata = { ...metadata, machine: nextMachine };
    if (machine_type) {
      nextMetadata.size = machine_type;
    }
    nextMetadata.gpu = machineHasGpu(nextMachine);
    delete nextMetadata.reprovision_required;
    await pool().query(
      `UPDATE project_hosts SET region=$2, metadata=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [row.id, nextRegion, nextMetadata],
    );
    const { rows } = await pool().query(
      `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
      [row.id],
    );
    if (!rows[0]) throw new Error("host not found");
    await logCloudVmEvent({
      vm_id: row.id,
      action: "update_config",
      status: "success",
      provider: normalizeProviderId(nextMachine.cloud),
      spec: {
        before: beforeSpec,
        after: buildConfigSpec(nextMachine, nextRegion),
      },
    });
    return parseRow(rows[0]);
  }

  if (!isDeprovisioned && (regionChanged || zoneChanged)) {
    throw new Error("region/zone can only be changed when deprovisioned");
  }

  if (!isDeprovisioned && (storageModeChanged || diskTypeChanged)) {
    throw new Error("disk type/storage mode changes require deprovisioning");
  }

  const requiresReprovision =
    !isSelfHost && nonDiskChange && row.status === "off";

  if (!isSelfHost && nonDiskChange && row.status !== "off") {
    throw new Error(
      "host must be stopped before changing CPU/RAM/machine type",
    );
  }

  if (!isSelfHost && nextDisk == null && !requiresReprovision) {
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
    ...(requiresReprovision ? { reprovision_required: true } : {}),
    ...(machineChanged ? { gpu: machineHasGpu(nextMachine) } : {}),
    ...(resizeWarning
      ? {
          last_action: "resize_disk",
          last_action_status: `warning: ${resizeWarning}`,
          last_action_error: resizeWarning,
          last_action_at: new Date().toISOString(),
        }
      : {}),
  };
  if (machineChanged && nextMachine.machine_type) {
    nextMetadata.size = nextMachine.machine_type;
  }
  await pool().query(
    `UPDATE project_hosts SET region=$2, metadata=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [row.id, nextRegion, nextMetadata],
  );
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [row.id],
  );
  if (!rows[0]) throw new Error("host not found");
  await logCloudVmEvent({
    vm_id: row.id,
    action: "update_config",
    status: "success",
    provider: normalizeProviderId(nextMachine.cloud),
    spec: {
      before: beforeSpec,
      after: buildConfigSpec(nextMachine, nextRegion),
    },
  });
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
}): Promise<HostLroResponse> {
  const row = await loadHostForStartStop(id, account_id);
  assertHostRunningForUpgrade(row);
  return await createHostLro({
    kind: HOST_UPGRADE_LRO_KIND,
    row,
    account_id,
    input: { id: row.id, account_id, targets, base_url },
    dedupe_key: `${HOST_UPGRADE_LRO_KIND}:${row.id}`,
  });
}

function assertHostRunningForUpgrade(row: any) {
  const status = String(row.status ?? "");
  if (status !== "active" && status !== "running") {
    throw new Error("host must be running to upgrade software");
  }
}

function mapUpgradeArtifact(artifact: string): "project_host" | "project_bundle" | "tools" | undefined {
  if (artifact === "project-host") return "project_host";
  if (artifact === "project" || artifact === "project-bundle") {
    return "project_bundle";
  }
  if (artifact === "tools") return "tools";
  return undefined;
}

export async function upgradeHostSoftwareInternal({
  account_id,
  id,
  targets,
  base_url,
}: {
  account_id?: string;
  id: string;
  targets: HostSoftwareUpgradeTarget[];
  base_url?: string;
}): Promise<HostSoftwareUpgradeResponse> {
  const row = await loadHostForStartStop(id, account_id);
  assertHostRunningForUpgrade(row);
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
  const response = await client.upgradeSoftware({
    targets,
    base_url: resolvedBaseUrl,
  });
  const results = response.results ?? [];
  if (results.length) {
    const metadata = row.metadata ?? {};
    const software = { ...(metadata.software ?? {}) } as Record<string, string>;
    for (const result of results) {
      const key = mapUpgradeArtifact(result.artifact);
      if (key) {
        software[key] = result.version;
      }
    }
    const nextMetadata = { ...metadata, software };
    const nextVersion = software.project_host ?? row.version ?? null;
    await pool().query(
      `UPDATE project_hosts SET metadata=$2, version=$3, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [row.id, nextMetadata, nextVersion],
    );
  }
  return response;
}

export async function deleteHost({
  account_id,
  id,
  skip_backups,
}: {
  account_id?: string;
  id: string;
  skip_backups?: boolean;
}): Promise<HostLroResponse> {
  const row = await loadOwnedHost(id, account_id);
  const kind =
    row.status === "deprovisioned"
      ? HOST_DELETE_LRO_KIND
      : HOST_DEPROVISION_LRO_KIND;
  return await createHostLro({
    kind,
    row,
    account_id,
    input: { id: row.id, account_id, skip_backups: !!skip_backups },
    dedupe_key: `${kind}:${row.id}`,
  });
}

export async function deleteHostInternal({
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
    logStatusUpdate(id, "deprovisioning", "api");
    await pool().query(
      `UPDATE project_hosts SET status=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
      [id, "deprovisioning"],
    );
    return;
  }
  logStatusUpdate(id, "deprovisioned", "api");
  await pool().query(
    `UPDATE project_hosts SET status=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, "deprovisioned"],
  );
}
