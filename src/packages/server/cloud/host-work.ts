import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { deleteHostDns, ensureHostDns, hasDns } from "./dns";
import {
  deleteCloudflareTunnel,
  hasCloudflareTunnel,
  ensureCloudflareTunnelForHost,
} from "./cloudflare-tunnel";
import { enqueueCloudVmWorkOnce, logCloudVmEvent } from "./db";
import { provisionIfNeeded } from "./host-util";
import type { CloudVmWorkHandlers } from "./worker";
import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import { buildCloudInitStartupScript, handleBootstrap } from "./bootstrap-host";
import { bumpReconcile, DEFAULT_INTERVALS } from "./reconcile";
import { normalizeProviderId } from "@cocalc/cloud";
import { getProviderContext } from "./provider-context";
import siteURL from "@cocalc/database/settings/site-url";
import {
  createBootstrapToken,
  revokeBootstrapTokensForHost,
} from "@cocalc/server/project-host/bootstrap-token";

const logger = getLogger("server:cloud:host-work");
const pool = () => getPool();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForProviderStatus(opts: {
  entry: Awaited<ReturnType<typeof getProviderContext>>["entry"];
  creds: any;
  runtime: any;
  desired: Array<"running" | "off" | "stopped" | "starting" | "error">;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<"running" | "starting" | "off" | "stopped" | "error" | undefined> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let lastStatus:
    | "running"
    | "starting"
    | "off"
    | "stopped"
    | "error"
    | undefined;
  while (Date.now() < deadline) {
    try {
      if (opts.entry.provider.getStatus) {
        const status = await opts.entry.provider.getStatus(
          opts.runtime,
          opts.creds,
        );
        lastStatus = status;
      } else if (opts.entry.provider.getInstance) {
        const remote = await opts.entry.provider.getInstance(
          opts.runtime,
          opts.creds,
        );
        if (!remote) {
          lastStatus = "off";
        } else {
          const mapped =
            opts.entry.provider.mapStatus?.(remote.status) ??
            remote.status ??
            undefined;
          lastStatus = mapped as typeof lastStatus;
        }
      }
      if (lastStatus && opts.desired.includes(lastStatus)) {
        return lastStatus;
      }
      if (lastStatus === "error") return lastStatus;
    } catch (err) {
      logger.warn("provider wait status failed", { err });
    }
    await sleep(intervalMs);
  }
  return lastStatus;
}

async function waitForLambdaStatus(opts: {
  entry: Awaited<ReturnType<typeof getProviderContext>>["entry"];
  creds: any;
  runtime: any;
  desired: "running" | "stopped";
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<"running" | "stopped" | "starting" | "error" | undefined> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let lastStatus: "running" | "stopped" | "starting" | "error" | undefined;
  while (Date.now() < deadline) {
    try {
      const status = await opts.entry.provider.getStatus(opts.runtime, opts.creds);
      lastStatus = status;
      if (status === opts.desired) return status;
      if (status === "error") return status;
    } catch (err) {
      logger.warn("lambda wait status failed", { err });
    }
    await sleep(intervalMs);
  }
  return lastStatus;
}

async function waitForLambdaInstanceGone(opts: {
  entry: Awaited<ReturnType<typeof getProviderContext>>["entry"];
  creds: any;
  runtime: any;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const inst = await opts.entry.provider.getInstance?.(opts.runtime, opts.creds);
      if (!inst) return true;
    } catch (err) {
      logger.warn("lambda wait instance failed", { err });
    }
    await sleep(intervalMs);
  }
  return false;
}

async function loadHostRow(id: string) {
  const { rows } = await pool().query(
    "SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [id],
  );
  return rows[0];
}

async function updateHostRow(id: string, updates: Record<string, any>) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) return;
  if (updates.status !== undefined) {
    const stack = new Error().stack;
    logger.debug("status update", {
      host_id: id,
      status: updates.status,
      source: "host-work",
      stack,
    });
  }
  const sets = keys.map((key, idx) => `${key}=$${idx + 2}`);
  await pool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, ...keys.map((key) => updates[key])],
  );
}

async function updateProjectsHostUrls(opts: {
  host_id: string;
  public_url?: string | null;
  internal_url?: string | null;
  ssh_server?: string | null;
}) {
  const updates: Array<[string, string | null | undefined]> = [
    ["public_url", opts.public_url],
    ["internal_url", opts.internal_url],
    ["ssh_server", opts.ssh_server],
  ];
  const params: Array<string | null | undefined> = [opts.host_id];
  let expr = "coalesce(host, '{}'::jsonb)";
  let idx = 2;
  for (const [field, value] of updates) {
    if (value === undefined) continue;
    expr = `jsonb_set(${expr}, '{${field}}', to_jsonb($${idx++}::text), true)`;
    params.push(value);
  }
  if (idx === 2) return;
  await pool().query(
    `UPDATE projects
     SET host=${expr}
     WHERE host_id=$1`,
    params,
  );
}

function setRuntimeObservedAt(metadata: any, at: Date): any {
  if (!metadata?.runtime) return metadata;
  return {
    ...metadata,
    runtime: {
      ...metadata.runtime,
      observed_at: at.toISOString(),
    },
  };
}

async function ensureDnsForHost(row: any) {
  if (await hasCloudflareTunnel()) {
    try {
      const existing = row.metadata?.cloudflare_tunnel;
      const tunnel = await ensureCloudflareTunnelForHost({
        host_id: row.id,
        existing,
      });
      if (!tunnel) return;
      const tunnelChanged =
        !existing ||
        existing.id !== tunnel.id ||
        existing.hostname !== tunnel.hostname ||
        existing.record_id !== tunnel.record_id ||
        existing.token !== tunnel.token;
      const nextMetadata = {
        ...(row.metadata ?? {}),
        cloudflare_tunnel: tunnel,
        ...(tunnelChanged
          ? {
              bootstrap: {
                ...(row.metadata?.bootstrap ?? {}),
                status: "pending",
              },
            }
          : {}),
      };
      row.metadata = nextMetadata;
      const nextUrls = {
        public_url: `https://${tunnel.hostname}`,
        internal_url: `https://${tunnel.hostname}`,
      };
      await updateHostRow(row.id, {
        metadata: nextMetadata,
        public_url: nextUrls.public_url,
        internal_url: nextUrls.internal_url,
      });
      await updateProjectsHostUrls({
        host_id: row.id,
        public_url: nextUrls.public_url,
        internal_url: nextUrls.internal_url,
        ssh_server: row.ssh_server,
      });
    } catch (err) {
      logger.warn("cloudflare tunnel ensure failed", {
        host_id: row.id,
        err,
      });
    }
    return;
  }
  if (!row?.metadata?.runtime?.public_ip) return;
  if (!(await hasDns())) return;
  try {
    const dns = await ensureHostDns({
      host_id: row.id,
      ipAddress: row.metadata.runtime.public_ip,
      record_id: row.metadata?.dns?.record_id,
    });
    row.metadata = { ...row.metadata, dns };
    const nextUrls = {
      public_url: `https://${dns.name}`,
      internal_url: `https://${dns.name}`,
    };
    await updateHostRow(row.id, {
      metadata: row.metadata,
      public_url: nextUrls.public_url,
      internal_url: nextUrls.internal_url,
    });
    await updateProjectsHostUrls({
      host_id: row.id,
      public_url: nextUrls.public_url,
      internal_url: nextUrls.internal_url,
      ssh_server: row.ssh_server,
    });
  } catch (err) {
    logger.warn("dns update failed", { host_id: row.id, err });
  }
}

async function refreshRuntimePublicIp(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(machine.cloud);
  if (!providerId || !runtime?.instance_id) return undefined;
  logger.debug("refreshRuntimePublicIp: fetching", {
    host_id: row.id,
    provider: providerId,
    instance_id: runtime.instance_id,
  });
  const { entry, creds } = await getProviderContext(providerId);
  if (!entry.provider.getInstance) return undefined;
  const instance = await entry.provider.getInstance(runtime, creds);
  const ip = instance?.public_ip ?? undefined;
  logger.debug("refreshRuntimePublicIp: result", {
    host_id: row.id,
    provider: providerId,
    instance_id: runtime.instance_id,
    ip,
  });
  return ip;
}

async function scheduleRuntimeRefresh(row: any) {
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(row.metadata?.machine?.cloud);
  if (!runtime?.instance_id) {
    logger.debug("scheduleRuntimeRefresh: skip (no instance_id)", {
      host_id: row.id,
      provider: providerId ?? row.metadata?.machine?.cloud,
    });
    return;
  }
  if (runtime.public_ip) {
    logger.debug("scheduleRuntimeRefresh: skip (already has public_ip)", {
      host_id: row.id,
      provider: providerId ?? row.metadata?.machine?.cloud,
      public_ip: runtime.public_ip,
    });
    return;
  }
  logger.debug("scheduleRuntimeRefresh", {
    host_id: row.id,
    provider: providerId ?? row.metadata?.machine?.cloud,
    instance_id: runtime.instance_id,
  });
  const enqueued = await enqueueCloudVmWorkOnce({
    vm_id: row.id,
    action: "refresh_runtime",
    payload: {
      provider: providerId ?? row.metadata?.machine?.cloud,
      attempt: 0,
    },
  });
  if (enqueued) {
    logger.info("scheduleRuntimeRefresh: enqueue", {
      host_id: row.id,
      provider: providerId ?? row.metadata?.machine?.cloud,
      instance_id: runtime.instance_id,
    });
  } else {
    logger.debug("scheduleRuntimeRefresh: already queued", {
      host_id: row.id,
      provider: providerId ?? row.metadata?.machine?.cloud,
      instance_id: runtime.instance_id,
    });
  }
}

async function handleProvision(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const providerId = normalizeProviderId(machine.cloud);
  if (!providerId) {
    await updateHostRow(row.id, { status: "running" });
    return;
  }
  logger.debug("handleProvision: begin", {
    host_id: row.id,
    provider: providerId,
  });
  let startupScript: string | undefined;
  if (providerId) {
    try {
      const baseUrl = await siteURL();
      const token = await createBootstrapToken(row.id, {
        purpose: "bootstrap",
      });
      startupScript = await buildCloudInitStartupScript(
        row,
        token.token,
        baseUrl,
      );
      const nextMetadata = {
        ...(row.metadata ?? {}),
        bootstrap: {
          ...(row.metadata?.bootstrap ?? {}),
          status: "pending",
          pending_at: new Date().toISOString(),
          source: "cloud-init",
        },
      };
      row.metadata = nextMetadata;
      await updateHostRow(row.id, { metadata: nextMetadata });
    } catch (err) {
      logger.warn("cloud-init bootstrap preparation failed", {
        host_id: row.id,
        provider: providerId,
        err,
      });
    }
  }
  const provisioned = await provisionIfNeeded(row, { startupScript });
  const runtime = provisioned.metadata?.runtime;
  const observedAt = new Date();
  let nextMetadata = setRuntimeObservedAt(provisioned.metadata, observedAt);
  logger.debug("handleProvision: runtime", {
    host_id: row.id,
    provider: providerId,
    runtime,
  });
  let nextStatus = provisioned.status ?? "running";
  if (providerId === "lambda" && runtime?.instance_id) {
    await updateHostRow(row.id, {
      status: "starting",
      last_seen: null,
      metadata: nextMetadata,
    });
    const { entry, creds } = await getProviderContext(providerId);
    const waitedStatus = await waitForLambdaStatus({
      entry,
      creds,
      runtime,
      desired: "running",
    });
    const observedAtDone = new Date();
    nextMetadata = setRuntimeObservedAt(nextMetadata, observedAtDone);
    nextStatus = waitedStatus ?? "starting";
  } else if (
    (providerId === "nebius" || providerId === "hyperstack") &&
    runtime?.instance_id
  ) {
    await updateHostRow(row.id, {
      status: "starting",
      last_seen: null,
      metadata: nextMetadata,
    });
    const { entry, creds } = await getProviderContext(providerId);
    const waitedStatus = await waitForProviderStatus({
      entry,
      creds,
      runtime,
      desired: ["running"],
    });
    const observedAtDone = new Date();
    nextMetadata = setRuntimeObservedAt(nextMetadata, observedAtDone);
    nextStatus = waitedStatus ?? "starting";
  }
  const publicUrl =
    provisioned.public_url ??
    (runtime?.public_ip ? `http://${runtime.public_ip}` : undefined);
  const internalUrl =
    provisioned.internal_url ??
    (runtime?.public_ip ? `http://${runtime.public_ip}` : undefined);
  await updateHostRow(provisioned.id, {
    metadata: nextMetadata,
    status: nextStatus,
    public_url: publicUrl,
    internal_url: internalUrl,
  });
  await ensureDnsForHost({
    ...provisioned,
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
  });
  await scheduleRuntimeRefresh({ ...provisioned, metadata: nextMetadata });
  await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
  await logCloudVmEvent({
    vm_id: row.id,
    action: "create",
    status: "success",
    provider: providerId,
    spec: machine,
    runtime: runtime ?? undefined,
  });
}

async function handleStart(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const reprovisionRequired = !!row.metadata?.reprovision_required;
  const providerId = normalizeProviderId(machine.cloud);
  logger.debug("handleStart: begin", {
    host_id: row.id,
    provider: providerId ?? machine.cloud,
    runtime,
    reprovision_required: reprovisionRequired,
  });
  if (providerId) {
    if (!runtime?.instance_id || reprovisionRequired) {
      // If the VM was deprovisioned, treat "start" as "create" and provision now.
      if (reprovisionRequired && runtime?.instance_id) {
        const { entry, creds } = await getProviderContext(providerId);
        logger.info("handleStart: reprovision delete", {
          host_id: row.id,
          provider: providerId,
          instance_id: runtime.instance_id,
          zone: runtime.zone,
        });
        await entry.provider.deleteHost(runtime, creds, {
          preserveDataDisk: true,
        });
      }
      const clearedMetadata = {
        ...(row.metadata ?? {}),
      };
      if (reprovisionRequired && runtime?.instance_id) {
        const nextMachine = { ...(clearedMetadata.machine ?? {}) };
        const nextMachineMeta = { ...(nextMachine.metadata ?? {}) };
        if (providerId === "gcp") {
          const runtimeMeta = runtime.metadata as
            | { data_disk_name?: string }
            | undefined;
          nextMachineMeta.data_disk_name =
            runtimeMeta?.data_disk_name ?? `${runtime.instance_id}-data`;
        } else if (providerId === "nebius") {
          const runtimeMeta = runtime.metadata as
            | { diskIds?: { data?: string } }
            | undefined;
          if (runtimeMeta?.diskIds?.data) {
            nextMachineMeta.data_disk_id = runtimeMeta.diskIds.data;
          }
        } else if (providerId === "hyperstack") {
          const runtimeMeta = runtime.metadata as
            | { data_volume_id?: number; data_volume_name?: string }
            | undefined;
          if (runtimeMeta?.data_volume_id) {
            nextMachineMeta.data_volume_id = runtimeMeta.data_volume_id;
          }
          if (runtimeMeta?.data_volume_name) {
            nextMachineMeta.data_volume_name = runtimeMeta.data_volume_name;
          }
        }
        nextMachine.metadata = nextMachineMeta;
        clearedMetadata.machine = nextMachine;
      }
      delete clearedMetadata.runtime;
      delete clearedMetadata.dns;
      delete clearedMetadata.cloudflare_tunnel;
      delete clearedMetadata.reprovision_required;
      const rowForProvision = {
        ...row,
        metadata: clearedMetadata,
      };
      const observedAt = new Date();
      const metadataWithObserved = setRuntimeObservedAt(
        rowForProvision.metadata,
        observedAt,
      );
      await updateHostRow(row.id, {
        metadata: metadataWithObserved,
        status: "starting",
        last_seen: null,
        public_url: null,
        internal_url: null,
      });
      await handleProvision({
        ...rowForProvision,
        metadata: metadataWithObserved,
      });
      await logCloudVmEvent({
        vm_id: row.id,
        action: "start",
        status: "success",
        provider: providerId,
        spec: machine,
      });
      return;
    }
    const observedAt = new Date();
    const nextMetadata = setRuntimeObservedAt(row.metadata ?? {}, observedAt);
    await updateHostRow(row.id, {
      status: "starting",
      last_seen: null,
      metadata: nextMetadata,
    });
    const { entry, creds } = await getProviderContext(providerId);
    await entry.provider.startHost(runtime, creds);
    let statusAfterStart:
      | "running"
      | "starting"
      | "off"
      | "stopped"
      | "error"
      | undefined;
    if (providerId === "nebius" || providerId === "hyperstack") {
      statusAfterStart = await waitForProviderStatus({
        entry,
        creds,
        runtime,
        desired: ["running"],
      });
      const observedAtDone = new Date();
      const nextMetadataAfter = setRuntimeObservedAt(
        row.metadata ?? {},
        observedAtDone,
      );
      await updateHostRow(row.id, {
        status: statusAfterStart ?? "starting",
        metadata: nextMetadataAfter,
        last_seen: null,
      });
      row.metadata = nextMetadataAfter;
      if (statusAfterStart !== "running") {
        await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
        return;
      }
    }
  }
  const observedAt = new Date();
  const nextMetadata = setRuntimeObservedAt(row.metadata ?? {}, observedAt);
  await updateHostRow(row.id, {
    status: "running",
    metadata: nextMetadata,
  });
  const nextRow = { ...row, status: "running", metadata: nextMetadata };
  await ensureDnsForHost(nextRow);
  await scheduleRuntimeRefresh(nextRow);
  if (providerId) {
    await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
  }
  await logCloudVmEvent({
    vm_id: row.id,
    action: "start",
    status: "success",
    provider: providerId ?? machine.cloud,
    spec: machine,
    runtime,
  });
}

async function handleStop(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(machine.cloud);
  await revokeBootstrapTokensForHost(row.id, { purpose: "bootstrap" });
  let supportsStop = true;
  let stopConfirmed = false;
  if (providerId && runtime?.instance_id) {
    const observedAt = new Date();
    const nextMetadata = setRuntimeObservedAt(row.metadata ?? {}, observedAt);
    await updateHostRow(row.id, {
      status: "stopping",
      last_seen: null,
      metadata: nextMetadata,
    });
    const { entry, creds } = await getProviderContext(providerId);
    supportsStop = entry.capabilities.supportsStop;
    await entry.provider.stopHost(runtime, creds);
    if (providerId === "nebius" || providerId === "hyperstack") {
      const waitedStatus = await waitForProviderStatus({
        entry,
        creds,
        runtime,
        desired: ["off", "stopped"],
      });
      const observedAtDone = new Date();
      const nextMetadataAfter = setRuntimeObservedAt(
        row.metadata ?? {},
        observedAtDone,
      );
      await updateHostRow(row.id, {
        status: waitedStatus ?? "stopping",
        metadata: nextMetadataAfter,
        last_seen: null,
      });
      stopConfirmed = waitedStatus === "off" || waitedStatus === "stopped";
    }
  }
  if (providerId === "hyperstack") {
    if (!stopConfirmed) {
      await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
      return;
    }
    if (!(await hasCloudflareTunnel()) && (await hasDns())) {
      await deleteHostDns({ record_id: row.metadata?.dns?.record_id });
    }
    const nextMetadata = {
      ...(row.metadata ?? {}),
    };
    delete nextMetadata.runtime;
    delete nextMetadata.dns;
    delete nextMetadata.cloudflare_tunnel;
    await updateHostRow(row.id, {
      metadata: nextMetadata,
      status: "off",
      public_url: null,
      internal_url: null,
      last_seen: null,
    });
  } else if (providerId === "lambda") {
    const { entry, creds } = await getProviderContext(providerId);
    const gone = await waitForLambdaInstanceGone({ entry, creds, runtime });
    if (!gone) {
      await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
      return;
    }
    const nextMetadata = {
      ...(row.metadata ?? {}),
    };
    delete nextMetadata.runtime;
    delete nextMetadata.dns;
    delete nextMetadata.cloudflare_tunnel;
    await updateHostRow(row.id, {
      metadata: nextMetadata,
      status: "deprovisioned",
      public_url: null,
      internal_url: null,
      last_seen: null,
    });
  } else if (providerId && !supportsStop) {
    // Providers without a stop state (e.g., Lambda) should be treated as
    // deprovisioned when "stop" is requested.
    const nextMetadata = {
      ...(row.metadata ?? {}),
    };
    delete nextMetadata.runtime;
    delete nextMetadata.dns;
    delete nextMetadata.cloudflare_tunnel;
    await updateHostRow(row.id, {
      metadata: nextMetadata,
      status: "deprovisioned",
      public_url: null,
      internal_url: null,
      last_seen: null,
    });
  } else {
    if (providerId === "nebius" && !stopConfirmed) {
      if (providerId) {
        await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
      }
      return;
    }
    const observedAt = new Date();
    const nextMetadata = setRuntimeObservedAt(row.metadata ?? {}, observedAt);
    await updateHostRow(row.id, {
      status: "off",
      metadata: nextMetadata,
    });
  }
  await logCloudVmEvent({
    vm_id: row.id,
    action: "stop",
    status: "success",
    provider: providerId ?? machine.cloud,
    spec: machine,
    runtime,
  });
}

async function handleRestart(row: any, mode: "reboot" | "hard") {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(machine.cloud);
  logger.debug("handleRestart: begin", {
    host_id: row.id,
    provider: providerId ?? machine.cloud,
    mode,
    runtime,
  });
  if (!providerId) {
    await updateHostRow(row.id, { status: "running", last_seen: new Date() });
    return;
  }
  if (!runtime?.instance_id) {
    throw new Error("host is not provisioned");
  }
  const { entry, creds } = await getProviderContext(providerId);
  const provider = entry.provider;
  const observedAt = new Date();
  const nextMetadata = setRuntimeObservedAt(row.metadata ?? {}, observedAt);
  await updateHostRow(row.id, {
    status: "restarting",
    last_seen: null,
    metadata: nextMetadata,
  });
  if (mode === "hard") {
    if (provider.hardRestartHost) {
      await provider.hardRestartHost(runtime, creds);
    } else if (provider.restartHost) {
      await provider.restartHost(runtime, creds);
    } else if (entry.capabilities.supportsStop) {
      await provider.stopHost(runtime, creds);
      await provider.startHost(runtime, creds);
    } else {
      throw new Error("hard reboot not supported");
    }
  } else {
    if (provider.restartHost) {
      await provider.restartHost(runtime, creds);
    } else if (entry.capabilities.supportsStop) {
      await provider.stopHost(runtime, creds);
      await provider.startHost(runtime, creds);
    } else if (provider.hardRestartHost) {
      await provider.hardRestartHost(runtime, creds);
    } else {
      throw new Error("reboot not supported");
    }
  }
  const observedAtComplete = new Date();
  const nextMetadataComplete = setRuntimeObservedAt(
    row.metadata ?? {},
    observedAtComplete,
  );
  await updateHostRow(row.id, {
    status: "running",
    metadata: nextMetadataComplete,
  });
  await scheduleRuntimeRefresh({ ...row, metadata: nextMetadataComplete });
  await bumpReconcile(providerId, DEFAULT_INTERVALS.running_ms);
  await logCloudVmEvent({
    vm_id: row.id,
    action: mode === "hard" ? "hard_restart" : "restart",
    status: "success",
    provider: providerId,
    spec: machine,
    runtime,
  });
}

async function handleDelete(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(machine.cloud);
  await revokeBootstrapTokensForHost(row.id, { purpose: "bootstrap" });
  if (providerId && runtime?.instance_id) {
    const { entry, creds } = await getProviderContext(providerId);
    await entry.provider.deleteHost(runtime, creds);
  }
  if (await hasCloudflareTunnel()) {
    await deleteCloudflareTunnel({
      host_id: row.id,
      tunnel: row.metadata?.cloudflare_tunnel,
    });
  } else if (await hasDns()) {
    await deleteHostDns({ record_id: row.metadata?.dns?.record_id });
  }
  await logCloudVmEvent({
    vm_id: row.id,
    action: "delete",
    status: "success",
    provider: providerId ?? machine.cloud,
    spec: machine,
    runtime,
  });
  // set the project host to a deprovisioned state, which means all
  // the data stored there is definitely gone and no dns is setup.
  const nextMetadata = {
    ...(row.metadata ?? {}),
  };
  delete nextMetadata.runtime;
  delete nextMetadata.dns;
  delete nextMetadata.cloudflare_tunnel;
  await updateHostRow(row.id, {
    metadata: nextMetadata,
    status: "deprovisioned",
    public_url: null,
    internal_url: null,
    last_seen: null,
  });
}

async function handleRefreshRuntime(row: any) {
  const host = row;
  const runtime = host.metadata?.runtime;
  if (!runtime?.instance_id) return;
  if (runtime.public_ip) return;
  const providerId = normalizeProviderId(host.metadata?.machine?.cloud);
  logger.debug("handleRefreshRuntime", {
    host_id: host.id,
    provider: providerId ?? host.metadata?.machine?.cloud,
    instance_id: runtime.instance_id,
    attempt: row.payload?.attempt ?? 0,
  });
  logger.info("handleRefreshRuntime: attempt", {
    host_id: host.id,
    provider: providerId ?? host.metadata?.machine?.cloud,
    instance_id: runtime.instance_id,
    attempt: row.payload?.attempt ?? 0,
  });
  const public_ip = await refreshRuntimePublicIp(host);
  if (!public_ip) {
    const attempt = Number(row.payload?.attempt ?? 0);
    logger.debug("handleRefreshRuntime: still missing", {
      host_id: host.id,
      provider: providerId ?? host.metadata?.machine?.cloud,
      instance_id: runtime.instance_id,
      attempt,
    });
    if (attempt < 12) {
      setTimeout(() => {
        enqueueCloudVmWorkOnce({
          vm_id: host.id,
          action: "refresh_runtime",
          payload: {
            provider: providerId ?? host.metadata?.machine?.cloud,
            attempt: attempt + 1,
          },
        }).catch((err) => {
          logger.warn("refresh_runtime enqueue failed", { err });
        });
      }, 10000);
    }
    return;
  }
  logger.info("handleRefreshRuntime: obtained", {
    host_id: host.id,
    provider: host.metadata?.machine?.cloud,
    instance_id: runtime.instance_id,
    public_ip,
  });
  const nextMetadata = {
    ...(host.metadata ?? {}),
    runtime: { ...runtime, public_ip },
  };
  const publicUrl = host.public_url ?? `http://${public_ip}`;
  const internalUrl = host.internal_url ?? `http://${public_ip}`;
  const nextStatus = host.status === "starting" ? "running" : host.status;
  await updateHostRow(host.id, {
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
    status: nextStatus,
  });
  const nextHost = {
    ...host,
    status: nextStatus,
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
  };
  await ensureDnsForHost(nextHost);
  await logCloudVmEvent({
    vm_id: host.id,
    action: "refresh_runtime",
    status: "success",
    provider: providerId ?? host.metadata?.machine?.cloud,
    runtime: { ...runtime, public_ip },
  });
}

async function markHostError(row: any, err: unknown) {
  const message = err ? String(err) : "unknown error";
  const nextMetadata = {
    ...(row.metadata ?? {}),
    last_error: message,
    last_error_at: new Date().toISOString(),
  };
  await updateHostRow(row.id, {
    metadata: nextMetadata,
    status: "error",
    last_seen: null,
  });
}

export const cloudHostHandlers: CloudVmWorkHandlers = {
  provision: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleProvision(host);
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  start: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleStart(host);
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  stop: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleStop(host);
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  restart: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleRestart(host, "reboot");
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  hard_restart: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleRestart(host, "hard");
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  delete: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleDelete(host);
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  refresh_runtime: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleRefreshRuntime(host);
    } catch (err) {
      await markHostError(host, err);
      throw err;
    }
  },
  bootstrap: async (row) => {
    const host = await loadHostRow(row.vm_id);
    if (!host) return;
    try {
      await handleBootstrap(host);
    } catch (err) {
      const metadata = host.metadata ?? {};
      await updateHostRow(host.id, {
        metadata: {
          ...metadata,
          bootstrap: {
            status: "error",
            error: String(err),
            failed_at: new Date().toISOString(),
          },
        },
      });
      await markHostError(host, err);
      throw err;
    }
  },
};
