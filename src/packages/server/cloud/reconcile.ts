// Cloud VM reconciliation loop.
//
// Periodically compare cloud reality vs. our DB state so we don't
// accidentally leave paid VMs running or show stale status in the UI
// for an unbounded amount of time.
//
// This runs in parallel with the work queue worker and uses Postgres
// advisory locks so multiple hubs can run safely without duplicating work
// at the EXACT SAME TIME.  TODO: fix properly.

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { InstancesClient } from "@google-cloud/compute";
import {
  ensureGcpProvider,
  ensureHyperstackProvider,
  ensureLambdaProvider,
} from "./host-util";
import { getVirtualMachines } from "@cocalc/cloud/hyperstack/client";
import { setHyperstackConfig } from "@cocalc/cloud/hyperstack/config";
import type { VirtualMachine } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { LambdaClient } from "@cocalc/cloud/lambda/client";
import { scheduleBootstrap } from "./bootstrap-host";

const logger = getLogger("server:cloud:reconcile");
const pool = () => getPool();

const RUNNING_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_INTERVAL_MS = 30 * 60 * 1000;
const EMPTY_INTERVAL_MS = 3 * 60 * 60 * 1000;

type Provider = "gcp" | "hyperstack" | "lambda";

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

async function loadHosts(provider: Provider): Promise<HostRow[]> {
  const { rows } = await pool().query(
    `
      SELECT id, name, status, metadata, public_url, internal_url
      FROM project_hosts
      WHERE metadata->'machine'->>'cloud' = $1
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
    `,
    [provider],
  );
  return rows[0] ?? { total: 0, running: 0 };
}

function nextInterval({ total, running }: { total: number; running: number }) {
  if (total === 0) return EMPTY_INTERVAL_MS;
  if (running > 0) return RUNNING_INTERVAL_MS;
  return IDLE_INTERVAL_MS;
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

async function listGcpInstances(prefix: string): Promise<RemoteInstance[]> {
  const { creds } = await ensureGcpProvider();
  if (!creds.service_account_json) return [];
  const parsed = JSON.parse(creds.service_account_json);
  const client = new InstancesClient({
    projectId: parsed.project_id,
    credentials: {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    },
  });
  const instances: RemoteInstance[] = [];
  for await (const [zoneName, scopedList] of client.aggregatedListAsync({
    project: parsed.project_id,
  })) {
    const zone = (zoneName ?? "").split("/").pop();
    const entries = scopedList?.instances ?? [];
    for (const inst of entries) {
      const name = inst.name ?? "";
      if (!name.startsWith(prefix)) continue;
      const public_ip =
        inst?.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? undefined;
      instances.push({
        instance_id: name,
        name,
        status: inst.status ?? undefined,
        zone,
        public_ip,
      });
    }
  }
  return instances;
}

async function listHyperstackInstances(prefix: string): Promise<RemoteInstance[]> {
  const { creds } = await ensureHyperstackProvider();
  setHyperstackConfig({ apiKey: creds.apiKey, prefix: creds.prefix });
  const list = await getVirtualMachines();
  return list
    .filter((vm: VirtualMachine) => vm.name?.startsWith(prefix))
    .map((vm: VirtualMachine) => ({
      instance_id: String(vm.id),
      name: vm.name,
      status: vm.status,
      zone: vm.environment?.name,
      public_ip: vm.floating_ip || undefined,
    }));
}

async function listLambdaInstances(prefix: string): Promise<RemoteInstance[]> {
  const { creds } = await ensureLambdaProvider();
  const client = new LambdaClient({ apiKey: creds.apiKey });
  const list = await client.listInstances();
  return (Array.isArray(list) ? list : [])
    .filter((vm: any) => (vm?.name ?? "").startsWith(prefix))
    .map((vm: any) => ({
      instance_id: vm.id,
      name: vm.name,
      status: vm.status,
      zone: vm.region?.name ?? vm.region,
      public_ip: vm.ip ?? undefined,
    }));
}

function mapStatus(provider: Provider, status?: string): string | undefined {
  if (!status) return undefined;
  const normalized = status.toLowerCase();
  if (provider === "gcp") {
    if (normalized === "running") return "running";
    if (normalized === "terminated") return "off";
    return "starting";
  }
  if (provider === "hyperstack") {
    if (normalized === "active" || normalized === "running") return "running";
    if (normalized === "shutoff" || normalized === "stopped") return "off";
    return "starting";
  }
  if (provider === "lambda") {
    if (normalized === "active") return "running";
    if (
      normalized === "terminated" ||
      normalized === "terminating" ||
      normalized === "preempted"
    )
      return "deprovisioned";
    if (normalized === "booting") return "starting";
    return "off";
  }
  return undefined;
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
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1`,
    params,
  );
}

async function reconcileProvider(provider: Provider) {
  const { project_hosts_google_prefix = "cocalc-host",
    project_hosts_hyperstack_prefix = "cocalc-host",
    project_hosts_lambda_prefix = "cocalc-host",
  } = await getServerSettings();
  const prefix =
    provider === "gcp"
      ? project_hosts_google_prefix
      : provider === "hyperstack"
        ? project_hosts_hyperstack_prefix
        : project_hosts_lambda_prefix;
  const hosts = await loadHosts(provider);
  const hostByInstanceId = new Map<string, HostRow>();
  for (const row of hosts) {
    const instance_id = row.metadata?.runtime?.instance_id;
    if (instance_id) hostByInstanceId.set(instance_id, row);
  }

  let instances: RemoteInstance[] = [];
  if (provider === "gcp") {
    instances = await listGcpInstances(prefix);
  } else if (provider === "hyperstack") {
    instances = await listHyperstackInstances(prefix);
  } else if (provider === "lambda") {
    instances = await listLambdaInstances(prefix);
  }

  const remoteById = new Map<string, RemoteInstance>();
  for (const inst of instances) {
    remoteById.set(inst.instance_id, inst);
  }

  for (const row of hosts) {
    const runtime = row.metadata?.runtime ?? {};
    const instance_id = runtime.instance_id;
    if (!instance_id) continue;
    const remote = remoteById.get(instance_id);
    if (!remote) {
      // Instance missing on provider; treat as deprovisioned and clear runtime.
      await updateHost(row, {
        status: "deprovisioned",
        runtime: null,
        public_url: null,
        internal_url: null,
      });
      continue;
    }
    const desiredStatus = mapStatus(provider, remote.status) ?? row.status;
    const nextRuntime = {
      ...runtime,
      public_ip: remote.public_ip ?? runtime.public_ip,
      zone: remote.zone ?? runtime.zone,
    };
    const publicUrl =
      row.public_url ?? (nextRuntime.public_ip ? `http://${nextRuntime.public_ip}` : undefined);
    const internalUrl =
      row.internal_url ??
      (nextRuntime.public_ip ? `http://${nextRuntime.public_ip}` : undefined);
    await updateHost(row, {
      status: desiredStatus,
      runtime: nextRuntime,
      public_url: publicUrl,
      internal_url: internalUrl,
    });
    if (remote.public_ip && !runtime.public_ip) {
      await scheduleBootstrap({
        ...row,
        metadata: { ...(row.metadata ?? {}), runtime: nextRuntime },
        public_url: row.public_url ?? `http://${remote.public_ip}`,
        internal_url: row.internal_url ?? `http://${remote.public_ip}`,
      });
    }
  }
}

export function startCloudVmReconciler() {
  const providers: Provider[] = ["gcp", "hyperstack", "lambda"];
  const timers = new Map<Provider, NodeJS.Timeout>();
  let stopped = false;

  const schedule = async (provider: Provider) => {
    if (stopped) return;
    const counts = await countHosts(provider);
    const delay = nextInterval(counts);
    const timer = setTimeout(() => tick(provider), delay);
    timers.set(provider, timer);
  };

  const tick = async (provider: Provider) => {
    if (stopped) return;
    try {
      await withReconcileLock(provider, async () => {
        logger.debug("cloud reconcile tick", { provider });
        await reconcileProvider(provider);
      });
    } catch (err) {
      logger.warn("cloud reconcile failed", { provider, err });
    } finally {
      await schedule(provider);
    }
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
