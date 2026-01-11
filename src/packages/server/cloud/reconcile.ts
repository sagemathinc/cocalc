// Cloud VM reconciliation loop.
//
// Periodically compare cloud reality vs. our DB state so we don't
// accidentally leave paid VMs running or show stale status in the UI
// for an unbounded amount of time.
//
// This runs in parallel with the work queue worker and uses Postgres
// advisory locks so multiple hubs can run safely without duplicating work.

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { ProviderId } from "@cocalc/cloud";
import { getProviderContext } from "./provider-context";
import { DisksClient } from "@google-cloud/compute";
import { NebiusClient } from "@cocalc/cloud/nebius/client";
import { getVolumes } from "@cocalc/cloud/hyperstack/client";
import { listServerProviders } from "./providers";

const logger = getLogger("server:cloud:reconcile");
const pool = () => getPool();

export const DEFAULT_INTERVALS = {
  running_ms: 5 * 60 * 1000,
  idle_ms: 30 * 60 * 1000,
  empty_ms: 3 * 60 * 60 * 1000,
};

type Intervals = typeof DEFAULT_INTERVALS;

export const PROVIDERS: ProviderId[] = listServerProviders()
  .map((provider) => provider.id)
  .filter((id) => id !== "local");

type Provider = ProviderId;

type ReconcileState = {
  last_run_at?: Date | null;
  next_run_at?: Date | null;
  last_error?: string | null;
};

type HostRow = {
  id: string;
  name?: string;
  status?: string;
  metadata?: Record<string, any>;
  public_url?: string;
  internal_url?: string;
};

type RemoteInstance = {
  instance_id: string;
  name?: string;
  status?: string;
  zone?: string;
  public_ip?: string;
};

const RECONCILE_MISSING_CONFIRMATIONS = 2;
const RECONCILE_GRACE_MS = 2 * 60 * 1000;

type DiskStatus = "present" | "missing" | "unknown";

async function loadHosts(provider: Provider): Promise<HostRow[]> {
  const { rows } = await pool().query(
    `
      SELECT id, name, status, metadata, public_url, internal_url
      FROM project_hosts
      WHERE metadata->'machine'->>'cloud' = $1
        AND deleted IS NULL
    `,
    [provider],
  );
  return rows;
}

async function countHosts(provider: Provider): Promise<{
  total: number;
  running: number;
}> {
  const { rows } = await pool().query(
    `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status='running')::int AS running
      FROM project_hosts
      WHERE metadata->'machine'->>'cloud' = $1
        AND deleted IS NULL
    `,
    [provider],
  );
  return rows[0] ?? { total: 0, running: 0 };
}

function nextInterval(
  { total, running }: { total: number; running: number },
  intervals: Intervals = DEFAULT_INTERVALS,
) {
  if (total === 0) return intervals.empty_ms;
  if (running > 0) return intervals.running_ms;
  return intervals.idle_ms;
}

async function getReconcileState(provider: Provider): Promise<ReconcileState> {
  const { rows } = await pool().query(
    `
      SELECT last_run_at, next_run_at, last_error
      FROM cloud_reconcile_state
      WHERE provider=$1
    `,
    [provider],
  );
  return rows[0] ?? {};
}

async function setReconcileState(
  provider: Provider,
  opts: {
    last_run_at?: Date | null;
    next_run_at?: Date | null;
    last_error?: string | null;
  },
) {
  await pool().query(
    `
      INSERT INTO cloud_reconcile_state
        (provider, last_run_at, next_run_at, last_error, updated_at)
      VALUES ($1,$2,$3,$4, NOW())
      ON CONFLICT (provider)
      DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        next_run_at = EXCLUDED.next_run_at,
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
    `,
    [
      provider,
      opts.last_run_at ?? null,
      opts.next_run_at ?? null,
      opts.last_error ?? null,
    ],
  );
}

export async function bumpReconcile(provider: Provider, interval_ms = DEFAULT_INTERVALS.running_ms) {
  const nextAt = new Date(Date.now() + interval_ms);
  await pool().query(
    `
      INSERT INTO cloud_reconcile_state
        (provider, next_run_at, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (provider)
      DO UPDATE SET
        next_run_at = LEAST(
          COALESCE(cloud_reconcile_state.next_run_at, EXCLUDED.next_run_at),
          EXCLUDED.next_run_at
        ),
        last_error = NULL,
        updated_at = NOW()
    `,
    [provider, nextAt],
  );
}

async function withReconcileLock<T>(
  provider: Provider,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const lockKey = `cloud_reconcile:${provider}`;
  const { rows } = await pool().query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [lockKey],
  );
  if (!rows[0]?.locked) return undefined;
  try {
    return await fn();
  } finally {
    await pool().query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
  }
}

async function listProviderInstances(
  provider: Provider,
  prefix: string | undefined,
): Promise<RemoteInstance[] | undefined> {
  const { entry, creds } = await getProviderContext(provider);
  if (!entry.provider.listInstances) {
    logger.warn("cloud reconcile: listInstances not implemented", { provider });
    return undefined;
  }
  return await entry.provider.listInstances(
    creds,
    prefix ? { namePrefix: prefix } : undefined,
  );
}

function parseLastActionAt(row: HostRow): Date | undefined {
  const value = row.metadata?.last_action_at;
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getMissingCount(runtime: Record<string, any> | undefined): number {
  return Number(runtime?.metadata?.reconcile?.missing_count ?? 0);
}

function setMissingCount(
  runtime: Record<string, any>,
  count: number,
  now: Date,
): Record<string, any> {
  const metadata = runtime.metadata ?? {};
  const reconcile = metadata.reconcile ?? {};
  return {
    ...runtime,
    metadata: {
      ...metadata,
      reconcile: {
        ...reconcile,
        missing_count: count,
        last_missing_at: count ? now.toISOString() : undefined,
      },
    },
  };
}

async function dataDiskStatus(
  provider: Provider,
  row: HostRow,
  creds: any,
): Promise<DiskStatus> {
  const runtime = row.metadata?.runtime ?? {};
  const runtimeMeta = runtime.metadata ?? {};
  if (provider === "lambda") return "missing";
  if (provider === "self-host") return "unknown";
  if (provider === "gcp") {
    const zone =
      runtime.zone ??
      row.metadata?.machine?.zone ??
      runtimeMeta.zone ??
      row.metadata?.machine?.metadata?.zone;
    let diskName: string | undefined = runtimeMeta.data_disk_name;
    if (!diskName && runtimeMeta.data_disk_uri) {
      diskName = String(runtimeMeta.data_disk_uri).split("/").pop();
    }
    if (!zone || !diskName) return "unknown";
    const diskClient = new DisksClient(creds);
    try {
      await diskClient.get({ project: creds.projectId, zone, disk: diskName });
      return "present";
    } catch (err) {
      const message = String((err as any)?.message ?? err);
      const code = (err as any)?.code ?? (err as any)?.status;
      if (code === 404 || message.includes("was not found")) {
        return "missing";
      }
      logger.warn("cloud reconcile: gcp disk lookup failed", {
        host_id: row.id,
        disk: diskName,
        err,
      });
      return "unknown";
    }
  }
  if (provider === "hyperstack") {
    const volumeId = Number(runtimeMeta.data_volume_id);
    if (!Number.isFinite(volumeId) || volumeId <= 0) return "unknown";
    try {
      const volumes = await getVolumes(false);
      const volume = volumes.find((item) => item.id === volumeId);
      if (!volume) return "missing";
      const status = String(volume.status ?? "").toLowerCase();
      if (status === "deleted") return "missing";
      return "present";
    } catch (err) {
      logger.warn("cloud reconcile: hyperstack volume lookup failed", {
        host_id: row.id,
        volumeId,
        err,
      });
      return "unknown";
    }
  }
  if (provider === "nebius") {
    const diskId = runtimeMeta.diskIds?.data;
    if (!diskId) return "unknown";
    try {
      const client = new NebiusClient(creds);
      const parentId = creds.parentId;
      if (!parentId) return "unknown";
      let pageToken = "";
      for (;;) {
        const res = await client.disks.list({
          parentId,
          pageSize: 1000,
          pageToken,
        } as any);
        const match = (res.items ?? []).find(
          (disk) => disk.metadata?.id === diskId,
        );
        if (match) return "present";
        const nextToken = res.nextPageToken ?? "";
        if (!nextToken) return "missing";
        pageToken = nextToken;
      }
    } catch (err) {
      logger.warn("cloud reconcile: nebius disk lookup failed", {
        host_id: row.id,
        diskId,
        err,
      });
      return "unknown";
    }
  }
  return "unknown";
}

async function updateHost(
  row: HostRow,
  updates: {
    status?: string;
    runtime?: Record<string, any> | null;
    public_url?: string | null;
    internal_url?: string | null;
  },
) {
  const sets: string[] = [];
  const params: any[] = [row.id];
  let idx = 2;
  if (updates.status) {
    sets.push(`status=$${idx++}`);
    params.push(updates.status);
  }
  if (updates.runtime !== undefined) {
    // Merge runtime into metadata safely.
    sets.push(
      `metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb), '{runtime}', $${idx++}::jsonb, true)`,
    );
    params.push(JSON.stringify(updates.runtime));
  }
  if (updates.public_url !== undefined) {
    sets.push(`public_url=$${idx++}`);
    params.push(updates.public_url);
  }
  if (updates.internal_url !== undefined) {
    sets.push(`internal_url=$${idx++}`);
    params.push(updates.internal_url);
  }
  if (!sets.length) return;
  await pool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    params,
  );
}

async function reconcileProvider(provider: Provider) {
  const { prefix, entry, creds } = await getProviderContext(provider);
  const hosts = await loadHosts(provider);
  const instances = await listProviderInstances(provider, prefix);
  if (!instances) return;

  const remoteById = new Map<string, RemoteInstance>();
  for (const inst of instances) {
    remoteById.set(inst.instance_id, inst);
  }

  for (const row of hosts) {
    const runtime = row.metadata?.runtime ?? {};
    const instance_id = runtime.instance_id;
    if (!instance_id) continue;
    const now = new Date();
    const remote = remoteById.get(instance_id);
    const lastActionAt = parseLastActionAt(row);
    const inGrace =
      lastActionAt &&
      now.getTime() - lastActionAt.getTime() < RECONCILE_GRACE_MS;
    let missingCount = getMissingCount(runtime);
    let nextRuntime = {
      ...runtime,
      provider_status: remote?.status ?? "missing",
      observed_at: now.toISOString(),
      public_ip: remote?.public_ip ?? (remote ? runtime.public_ip : undefined),
      zone: remote?.zone ?? runtime.zone,
    };
    if (!remote) {
      missingCount += 1;
      nextRuntime = setMissingCount(nextRuntime, missingCount, now);
    } else if (missingCount !== 0) {
      nextRuntime = setMissingCount(nextRuntime, 0, now);
    }

    if (inGrace) {
      await updateHost(row, { runtime: nextRuntime });
      continue;
    }

    if (!remote) {
      if (missingCount < RECONCILE_MISSING_CONFIRMATIONS) {
        await updateHost(row, { runtime: nextRuntime });
        continue;
      }
      const diskState = await dataDiskStatus(provider, row, creds);
      if (diskState === "unknown") {
        await updateHost(row, { runtime: nextRuntime });
        continue;
      }
      if (diskState === "present") {
        await updateHost(row, {
          status: "off",
          runtime: {
            ...nextRuntime,
            public_ip: undefined,
          },
        });
        continue;
      }
      await updateHost(row, {
        status: "deprovisioned",
        runtime: null,
        public_url: null,
        internal_url: null,
      });
      continue;
    }

    const desiredStatus =
      entry.provider.mapStatus?.(remote.status) ?? row.status;
    const bootstrapDone = row.metadata?.bootstrap?.status === "done";
    const nextStatus =
      desiredStatus === "starting" && bootstrapDone ? "running" : desiredStatus;
    await updateHost(row, {
      status: nextStatus,
      runtime: nextRuntime,
    });
    // cloud-init handles bootstrap; no queue-based bootstrap scheduling.
  }
}

export type ReconcileRunResult = {
  ran: boolean;
  skipped?: "locked" | "not_due";
  next_at?: Date;
};

export async function runReconcileOnce(
  provider: Provider,
  opts: {
    now?: () => Date;
    intervals?: Intervals;
    reconcile?: (provider: Provider) => Promise<void>;
    count?: (provider: Provider) => Promise<{ total: number; running: number }>;
  } = {},
): Promise<ReconcileRunResult | undefined> {
  const now = opts.now ?? (() => new Date());
  const intervals = opts.intervals ?? DEFAULT_INTERVALS;
  const reconcile = opts.reconcile ?? reconcileProvider;
  const count = opts.count ?? countHosts;

  return await withReconcileLock(provider, async () => {
    const state = await getReconcileState(provider);
    const current = now();
    if (state.next_run_at && state.next_run_at > current) {
      return { ran: false, skipped: "not_due", next_at: state.next_run_at };
    }
    logger.debug("cloud reconcile tick", { provider });
    try {
      await reconcile(provider);
      const counts = await count(provider);
      const next_at = new Date(
        current.getTime() + nextInterval(counts, intervals),
      );
      await setReconcileState(provider, {
        last_run_at: current,
        next_run_at: next_at,
        last_error: null,
      });
      return { ran: true, next_at };
    } catch (err) {
      const next_at = new Date(current.getTime() + intervals.idle_ms);
      await setReconcileState(provider, {
        last_run_at: current,
        next_run_at: next_at,
        last_error: String(err),
      });
      throw err;
    }
  });
}

export function startCloudVmReconciler(
  opts: {
    providers?: Provider[];
    intervals?: Intervals;
  } = {},
) {
  const providers: Provider[] = opts.providers ?? [...PROVIDERS];
  const intervals = opts.intervals ?? DEFAULT_INTERVALS;
  logger.info("startCloudVmReconciler", { providers, intervals });
  const timers = new Map<Provider, NodeJS.Timeout>();
  let stopped = false;

  const schedule = async (provider: Provider, nextAt?: Date) => {
    if (stopped) return;
    let delay = intervals.idle_ms;
    if (nextAt) {
      delay = Math.max(1000, nextAt.getTime() - Date.now());
    } else {
      const counts = await countHosts(provider);
      delay = nextInterval(counts, intervals);
    }
    const timer = setTimeout(() => tick(provider), delay);
    timers.set(provider, timer);
  };

  const tick = async (provider: Provider) => {
    if (stopped) return;
    let nextAt: Date | undefined;
    try {
      const result = await runReconcileOnce(provider, { intervals });
      if (result?.next_at) {
        nextAt = result.next_at;
      } else if (result === undefined) {
        // Lock not acquired; schedule based on state if available.
        const state = await getReconcileState(provider);
        if (state.next_run_at) {
          nextAt = state.next_run_at;
        }
      }
    } catch (err) {
      logger.warn("cloud reconcile failed", { provider, err });
      nextAt = new Date(Date.now() + intervals.idle_ms);
      await setReconcileState(provider, {
        last_error: String(err),
        next_run_at: nextAt,
      });
    }
    await schedule(provider, nextAt);
  };

  for (const provider of providers) {
    void tick(provider);
  }

  return () => {
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
