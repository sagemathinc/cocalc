import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { deleteHostDns, ensureHostDns, hasDns } from "./dns";
import { logCloudVmEvent } from "./db";
import {
  ensureGcpProvider,
  ensureHyperstackProvider,
  provisionIfNeeded,
} from "./host-util";
import type { CloudVmWorkHandlers } from "./worker";
import type { HostMachine } from "@cocalc/conat/hub/api/hosts";

const logger = getLogger("server:cloud:host-work");
const pool = () => getPool();

async function loadHostRow(id: string) {
  const { rows } = await pool().query(
    "SELECT * FROM project_hosts WHERE id=$1",
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
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1`,
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

async function handleProvision(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  if (!machine.cloud) {
    await updateHostRow(row.id, { status: "running" });
    return;
  }
  const provisioned = await provisionIfNeeded(row);
  const runtime = provisioned.metadata?.runtime;
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
  await logCloudVmEvent({
    vm_id: row.id,
    action: "create",
    status: "success",
    provider: machine.cloud,
    spec: machine,
    runtime: runtime ?? undefined,
  });
}

async function handleStart(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  if (machine.cloud && runtime?.instance_id) {
    if (machine.cloud === "hyperstack") {
      const { provider, creds } = await ensureHyperstackProvider();
      await provider.startHost(runtime, creds);
    } else {
      if (machine.cloud !== "google-cloud" && machine.cloud !== "gcp") {
        throw new Error(`unsupported cloud provider ${machine.cloud}`);
      }
      const { provider, creds } = await ensureGcpProvider();
      await provider.startHost(runtime, creds);
    }
  }
  await updateHostRow(row.id, { status: "running", last_seen: new Date() });
  await ensureDnsForHost(row);
  await logCloudVmEvent({
    vm_id: row.id,
    action: "start",
    status: "success",
    provider: machine.cloud,
    spec: machine,
    runtime,
  });
}

async function handleStop(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  if (machine.cloud && runtime?.instance_id) {
    if (machine.cloud === "hyperstack") {
      const { provider, creds } = await ensureHyperstackProvider();
      await provider.stopHost(runtime, creds);
    } else {
      if (machine.cloud !== "google-cloud" && machine.cloud !== "gcp") {
        throw new Error(`unsupported cloud provider ${machine.cloud}`);
      }
      const { provider, creds } = await ensureGcpProvider();
      await provider.stopHost(runtime, creds);
    }
  }
  await updateHostRow(row.id, { status: "off", last_seen: new Date() });
  await logCloudVmEvent({
    vm_id: row.id,
    action: "stop",
    status: "success",
    provider: machine.cloud,
    spec: machine,
    runtime,
  });
}

async function handleDelete(row: any) {
  const machine: HostMachine = row.metadata?.machine ?? {};
  const runtime = row.metadata?.runtime;
  if (machine.cloud && runtime?.instance_id) {
    if (machine.cloud === "hyperstack") {
      const { provider, creds } = await ensureHyperstackProvider();
      await provider.deleteHost(runtime, creds);
    } else {
      if (machine.cloud !== "google-cloud" && machine.cloud !== "gcp") {
        throw new Error(`unsupported cloud provider ${machine.cloud}`);
      }
      const { provider, creds } = await ensureGcpProvider();
      await provider.deleteHost(runtime, creds);
    }
  }
  if (await hasDns()) {
    await deleteHostDns({ record_id: row.metadata?.dns?.record_id });
  }
  await logCloudVmEvent({
    vm_id: row.id,
    action: "delete",
    status: "success",
    provider: machine.cloud,
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
};
