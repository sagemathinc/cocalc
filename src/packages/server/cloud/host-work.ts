import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { deleteHostDns, ensureHostDns, hasDns } from "./dns";
import { enqueueCloudVmWork, logCloudVmEvent } from "./db";
import { provisionIfNeeded } from "./host-util";
import type { CloudVmWorkHandlers } from "./worker";
import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import { handleBootstrap, scheduleBootstrap } from "./bootstrap-host";
import { bumpReconcile, DEFAULT_INTERVALS } from "./reconcile";
import { normalizeProviderId } from "@cocalc/cloud";
import { getProviderContext } from "./provider-context";

const logger = getLogger("server:cloud:host-work");
const pool = () => getPool();

async function loadHostRow(id: string) {
  const { rows } = await pool().query(
    "SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL",
    [id],
  );
  return rows[0];
}

async function updateHostRow(id: string, updates: Record<string, any>) {
  const keys = Object.keys(updates).filter(
    (key) => updates[key] !== undefined,
  );
  if (!keys.length) return;
  const sets = keys.map((key, idx) => `${key}=$${idx + 2}`);
  await pool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, ...keys.map((key) => updates[key])],
  );
}

async function ensureDnsForHost(row: any) {
  if (!row?.metadata?.runtime?.public_ip) return;
  if (!(await hasDns())) return;
  try {
    const dns = await ensureHostDns({
      host_id: row.id,
      ipAddress: row.metadata.runtime.public_ip,
      record_id: row.metadata?.dns?.record_id,
    });
    row.metadata = { ...row.metadata, dns };
    await updateHostRow(row.id, {
      metadata: row.metadata,
      public_url: `https://${dns.name}`,
      internal_url: `https://${dns.name}`,
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
  logger.info("scheduleRuntimeRefresh: enqueue", {
    host_id: row.id,
    provider: providerId ?? row.metadata?.machine?.cloud,
    instance_id: runtime.instance_id,
  });
  await enqueueCloudVmWork({
    vm_id: row.id,
    action: "refresh_runtime",
    payload: { provider: providerId ?? row.metadata?.machine?.cloud, attempt: 0 },
  });
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
  const provisioned = await provisionIfNeeded(row);
  const runtime = provisioned.metadata?.runtime;
  logger.debug("handleProvision: runtime", {
    host_id: row.id,
    provider: providerId,
    runtime,
  });
  const publicUrl =
    provisioned.public_url ??
    (runtime?.public_ip ? `http://${runtime.public_ip}` : undefined);
  const internalUrl =
    provisioned.internal_url ??
    (runtime?.public_ip ? `http://${runtime.public_ip}` : undefined);
  await updateHostRow(provisioned.id, {
    metadata: provisioned.metadata,
    status: provisioned.status ?? "running",
    public_url: publicUrl,
    internal_url: internalUrl,
  });
  await ensureDnsForHost({ ...provisioned, public_url: publicUrl, internal_url: internalUrl });
  await scheduleRuntimeRefresh(provisioned);
  await scheduleBootstrap(provisioned);
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
  const providerId = normalizeProviderId(machine.cloud);
  logger.debug("handleStart: begin", {
    host_id: row.id,
    provider: providerId ?? machine.cloud,
    runtime,
  });
  if (providerId) {
    if (!runtime?.instance_id) {
      // If the VM was deprovisioned, treat "start" as "create" and provision now.
      await handleProvision(row);
      await logCloudVmEvent({
        vm_id: row.id,
        action: "start",
        status: "success",
        provider: providerId,
        spec: machine,
      });
      return;
    }
    const { entry, creds } = await getProviderContext(providerId);
    await entry.provider.startHost(runtime, creds);
  }
  await updateHostRow(row.id, { status: "running", last_seen: new Date() });
  await ensureDnsForHost(row);
  await scheduleRuntimeRefresh(row);
  await scheduleBootstrap(row);
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
  let supportsStop = true;
  if (providerId && runtime?.instance_id) {
    const { entry, creds } = await getProviderContext(providerId);
    supportsStop = entry.capabilities.supportsStop;
    await entry.provider.stopHost(runtime, creds);
  }
  if (providerId && !supportsStop) {
    // Providers without a stop state (e.g., Lambda) should be treated as
    // deprovisioned when "stop" is requested.
    const nextMetadata = {
      ...(row.metadata ?? {}),
    };
    delete nextMetadata.runtime;
    delete nextMetadata.dns;
    await updateHostRow(row.id, {
      metadata: nextMetadata,
      status: "deprovisioned",
      public_url: null,
      internal_url: null,
      last_seen: new Date(),
    });
  } else {
    await updateHostRow(row.id, { status: "off", last_seen: new Date() });
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

async function handleDelete(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  const providerId = normalizeProviderId(machine.cloud);
  if (providerId && runtime?.instance_id) {
    const { entry, creds } = await getProviderContext(providerId);
    await entry.provider.deleteHost(runtime, creds);
  }
  if (await hasDns()) {
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
  await updateHostRow(row.id, {
    metadata: nextMetadata,
    status: "deprovisioned",
    public_url: null,
    internal_url: null,
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
        enqueueCloudVmWork({
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
  await updateHostRow(host.id, {
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
  });
  await ensureDnsForHost({
    ...host,
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
  });
  await scheduleBootstrap({
    ...host,
    metadata: nextMetadata,
    public_url: publicUrl,
    internal_url: internalUrl,
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
