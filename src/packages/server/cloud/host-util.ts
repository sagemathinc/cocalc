import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import {
  GcpProvider,
  HyperstackProvider,
  LambdaProvider,
  type HostSpec,
  type HyperstackCreds,
  type LambdaCreds,
} from "@cocalc/cloud";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

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
  const gpu =
    machine.gpu_type && machine.gpu_type !== "none"
      ? {
          type: machine.gpu_type,
          count: Math.max(1, machine.gpu_count ?? 1),
        }
      : metadata.gpu
        ? { type: machine.gpu_type ?? "nvidia-l4", count: 1 }
        : undefined;
  const { google_cloud_compute_servers_prefix = "cocalc-host" } =
    await getServerSettings();
  const baseName = row.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const providerName =
    machine.cloud === "gcp" || machine.cloud === "google-cloud"
      ? gcpSafeName(google_cloud_compute_servers_prefix, baseName)
      : baseName;
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

export async function ensureGcpProvider() {
  const { google_cloud_service_account_json } = await getServerSettings();
  if (!google_cloud_service_account_json) {
    throw new Error("google_cloud_service_account_json is not configured");
  }
  const creds = { service_account_json: google_cloud_service_account_json };
  return { provider: new GcpProvider(), creds };
}

export async function ensureHyperstackProvider(): Promise<{
  provider: HyperstackProvider;
  creds: HyperstackCreds;
}> {
  const {
    hyperstack_api_key,
    hyperstack_ssh_public_key,
    hyperstack_compute_servers_prefix = "cocalc",
  } = await getServerSettings();
  if (!hyperstack_api_key) {
    throw new Error("hyperstack_api_key is not configured");
  }
  if (!hyperstack_ssh_public_key) {
    throw new Error("hyperstack_ssh_public_key is not configured");
  }
  return {
    provider: new HyperstackProvider(),
    creds: {
      apiKey: hyperstack_api_key,
      sshPublicKey: hyperstack_ssh_public_key,
      prefix: hyperstack_compute_servers_prefix,
    },
  };
}

export async function ensureLambdaProvider(): Promise<{
  provider: LambdaProvider;
  creds: LambdaCreds;
}> {
  const { lambda_cloud_api_key, lambda_cloud_ssh_public_key } =
    await getServerSettings();
  if (!lambda_cloud_api_key) {
    throw new Error("lambda_cloud_api_key is not configured");
  }
  if (!lambda_cloud_ssh_public_key) {
    throw new Error("lambda_cloud_ssh_public_key is not configured");
  }
  return {
    provider: new LambdaProvider(),
    creds: {
      apiKey: lambda_cloud_api_key,
      sshPublicKey: lambda_cloud_ssh_public_key,
    },
  };
}

export async function provisionIfNeeded(row: HostRow) {
  const metadata = row.metadata ?? {};
  const runtime = metadata.runtime;
  const machine: HostMachine = metadata.machine ?? {};
  if (!machine.cloud) {
    return row;
  }
  if (runtime?.instance_id) return row;
  const spec = await buildHostSpec(row);
  if (machine.cloud === "lambda") {
    const { provider, creds } = await ensureLambdaProvider();
    const runtimeCreated = await provider.createHost(spec, creds);
    return {
      ...row,
      status: "running",
      metadata: {
        ...metadata,
        runtime: runtimeCreated,
      },
    };
  }
  if (machine.cloud === "hyperstack") {
    const { provider, creds } = await ensureHyperstackProvider();
    const runtimeCreated = await provider.createHost(spec, creds);
    return {
      ...row,
      status: "running",
      metadata: {
        ...metadata,
        runtime: runtimeCreated,
      },
    };
  }
  if (machine.cloud !== "google-cloud" && machine.cloud !== "gcp") {
    throw new Error(`unsupported cloud provider ${machine.cloud}`);
  }
  const { provider, creds } = await ensureGcpProvider();
  const runtimeCreated = await provider.createHost(spec, creds);
  return {
    ...row,
    status: "running",
    metadata: {
      ...metadata,
      runtime: runtimeCreated,
    },
  };
}
