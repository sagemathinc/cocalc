import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import { type HostSpec, normalizeProviderId } from "@cocalc/cloud";
import getLogger from "@cocalc/backend/logger";
import { getControlPlaneSshKeypair } from "./ssh-key";
import { getProviderContext, getProviderPrefix } from "./provider-context";

const logger = getLogger("server:cloud:host-util");
export type HostRow = {
  id: string;
  name?: string;
  region?: string;
  status?: string;
  public_url?: string;
  internal_url?: string;
  metadata?: Record<string, any>;
};

function sizeToResources(size?: string): { cpu: number; ram_gb: number } {
  switch (size) {
    case "medium":
      return { cpu: 4, ram_gb: 16 };
    case "large":
      return { cpu: 8, ram_gb: 32 };
    case "gpu":
      return { cpu: 4, ram_gb: 24 };
    case "small":
    default:
      return { cpu: 2, ram_gb: 8 };
  }
}

export async function buildHostSpec(row: HostRow): Promise<HostSpec> {
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  const size = metadata.size ?? (row as any).size ?? "small";
  const { cpu, ram_gb } = sizeToResources(size);
  const disk_gb = machine.disk_gb ?? 100;
  const disk_type =
    machine.disk_type === "ssd"
      ? "ssd"
      : machine.disk_type === "standard"
        ? "standard"
        : "balanced";
  const storage_mode = machine.storage_mode;
  const gpu =
    machine.gpu_type && machine.gpu_type !== "none"
      ? {
          type: machine.gpu_type,
          count: Math.max(1, machine.gpu_count ?? 1),
        }
      : metadata.gpu
        ? { type: machine.gpu_type ?? "nvidia-l4", count: 1 }
        : undefined;
  const { publicKey: controlPlanePublicKey } =
    await getControlPlaneSshKeypair();
  const ssh_user = machine.metadata?.ssh_user ?? "ubuntu";
  const baseName = row.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const providerId = normalizeProviderId(machine.cloud);
  const prefix = providerId ? await getProviderPrefix(providerId) : "cocalc-host";
  const providerName = providerId ? gcpSafeName(prefix, baseName) : baseName;
  const sourceImage = machine.source_image ?? machine.metadata?.source_image;
  logger.debug("buildHostSpec source_image", {
    host_id: row.id,
    machine_source_image: machine.source_image,
    metadata_source_image: machine.metadata?.source_image,
    selected: sourceImage,
  });

  const spec: HostSpec = {
    name: providerName,
    region: row.region ?? "us-west1",
    zone: machine.zone,
    cpu,
    ram_gb,
    disk_gb,
    disk_type,
    gpu,
    metadata: {
      ...machine.metadata,
      machine_type: machine.machine_type,
      source_image: sourceImage,
      bootstrap_url: machine.bootstrap_url,
      startup_script: machine.startup_script,
      storage_mode,
      ssh_public_key: controlPlanePublicKey,
      ssh_user,
    },
  };
  return spec;
}

export function gcpSafeName(prefix: string, base: string): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  let safePrefix = normalize(prefix);
  if (!safePrefix || !/^[a-z]/.test(safePrefix)) {
    safePrefix = `cocalc-${safePrefix || "host"}`.replace(/^-+/, "");
  }
  let safeBase = normalize(base);
  const maxLen = 63;
  const room = maxLen - safePrefix.length - 1;
  if (room > 0) {
    if (safeBase.length > room) {
      safeBase = safeBase.slice(0, room);
    }
    return `${safePrefix}-${safeBase}`.replace(/-+$/g, "");
  }
  return safePrefix.slice(0, maxLen);
}

export async function provisionIfNeeded(row: HostRow) {
  const metadata = row.metadata ?? {};
  const runtime = metadata.runtime;
  const machine: HostMachine = metadata.machine ?? {};
  const providerId = normalizeProviderId(machine.cloud);
  if (!providerId) {
    return row;
  }
  if (runtime?.instance_id) return row;
  const spec = await buildHostSpec(row);
  const { entry, creds } = await getProviderContext(providerId);
  const runtimeCreated = await entry.provider.createHost(spec, creds);
  return {
    ...row,
    status: "running",
    metadata: {
      ...metadata,
      runtime: runtimeCreated,
    },
  };
}
