import type { CloudProvider, HostRuntime, HostSpec } from "../types";
import getLogger from "@cocalc/backend/logger";
import { LambdaClient } from "./client";

const logger = getLogger("cloud:lambda:provider");

export type LambdaCreds = {
  apiKey: string;
  sshPublicKey: string;
  prefix?: string;
};

type InstanceTypeEntry = {
  instance_type?: {
    name?: string;
    specs?: { vcpus?: number; memory_gib?: number; gpus?: number };
  };
  regions_with_capacity_available?: Array<{ name?: string }>;
};

type ImageEntry = {
  id: string;
  name?: string;
  family?: string;
  architecture?: string;
  region?: { name?: string };
};

function normalizePrefix(prefix?: string): string {
  const value = (prefix ?? "cocalc").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return value.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "cocalc";
}

function safeName(prefix: string, base: string, maxLen = 64): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  const safePrefix = clean(prefix);
  let safeBase = clean(base);
  const room = maxLen - safePrefix.length - 1;
  if (room > 0) {
    if (safeBase.length > room) {
      safeBase = safeBase.slice(0, room);
    }
    return `${safePrefix}-${safeBase}`.replace(/-+$/g, "");
  }
  return safePrefix.slice(0, maxLen);
}

function safeHostname(prefix: string, base: string): string {
  const raw = safeName(prefix, base, 63);
  if (!/^[a-z0-9]/.test(raw)) {
    return `host-${raw}`.slice(0, 63);
  }
  return raw;
}

async function ensureSshKey(
  client: LambdaClient,
  name: string,
  publicKey: string,
) {
  const keys = await client.listSshKeys();
  const existing = keys.find((k: any) => k.name === name);
  if (existing) {
    if (publicKey && existing.public_key && existing.public_key !== publicKey) {
      throw new Error(`Lambda SSH key ${name} exists with different key`);
    }
    return name;
  }
  await client.createSshKey(name, publicKey);
  return name;
}

async function ensureFilesystem(
  client: LambdaClient,
  name: string,
  region: string,
) {
  const filesystems = await client.listFilesystems();
  const existing = filesystems.find(
    (fs: any) => fs.name === name && fs.region?.name === region,
  );
  if (existing) {
    return existing;
  }
  return await client.createFilesystem(name, region);
}

function selectInstanceType(
  entries: InstanceTypeEntry[],
  region: string,
  spec: HostSpec,
): string {
  const wantsGpu = !!spec.gpu;
  const gpuCount = spec.gpu?.count ?? 0;
  const gpuType = spec.gpu?.type?.toLowerCase();
  const candidates = entries.filter((entry) => {
    const inRegion = (entry.regions_with_capacity_available ?? []).some(
      (r) => r.name === region,
    );
    if (!inRegion) return false;
    const specs = entry.instance_type?.specs ?? {};
    const vcpus = specs.vcpus ?? 0;
    const memory = specs.memory_gib ?? 0;
    const gpus = specs.gpus ?? 0;
    if (wantsGpu) {
      if (gpus <= 0) return false;
      if (gpuCount && gpus < gpuCount) return false;
      if (gpuType && !entry.instance_type?.name?.toLowerCase().includes(gpuType))
        return false;
    } else if (gpus > 0) {
      return false;
    }
    return vcpus >= spec.cpu && memory >= spec.ram_gb;
  });

  const sorted = candidates.sort((a, b) => {
    const aSpecs = a.instance_type?.specs ?? {};
    const bSpecs = b.instance_type?.specs ?? {};
    if ((aSpecs.vcpus ?? 0) !== (bSpecs.vcpus ?? 0)) {
      return (aSpecs.vcpus ?? 0) - (bSpecs.vcpus ?? 0);
    }
    return (aSpecs.memory_gib ?? 0) - (bSpecs.memory_gib ?? 0);
  });

  const chosen = sorted[0]?.instance_type?.name;
  if (!chosen) {
    throw new Error(`no Lambda instance type available for ${region}`);
  }
  return chosen;
}

function selectImage(images: ImageEntry[], spec: HostSpec): { id?: string } | { family?: string } {
  const directId =
    spec.metadata?.image_id ??
    spec.metadata?.source_image_id ??
    spec.metadata?.source_image;
  if (directId) {
    return { id: directId };
  }
  const family =
    spec.metadata?.image_family ?? spec.metadata?.source_image_family;
  if (family) {
    return { family };
  }
  const candidates = images.filter(
    (img) => (img.architecture ?? "").toLowerCase() === "x86_64",
  );
  const ubuntu = candidates.find((img) =>
    (img.family ?? "").toLowerCase().includes("ubuntu"),
  );
  if (ubuntu?.id) {
    return { id: ubuntu.id };
  }
  const first = candidates[0]?.id ?? images[0]?.id;
  if (!first) {
    throw new Error("no Lambda images available");
  }
  return { id: first };
}

function buildUserData(spec: HostSpec): string | undefined {
  const direct = spec.metadata?.user_data;
  if (direct) return direct;
  const script = spec.metadata?.startup_script;
  if (script) return script;
  const url = spec.metadata?.bootstrap_url;
  if (!url) return undefined;
  return `#!/bin/bash\nset -e\ncurl -fsSL ${url} | bash`;
}

export class LambdaProvider implements CloudProvider {
  async createHost(spec: HostSpec, creds: LambdaCreds): Promise<HostRuntime> {
    const client = new LambdaClient({ apiKey: creds.apiKey });
    const prefix = normalizePrefix(creds.prefix);
    const resourceName = safeName(prefix, spec.name, 64);
    const hostname = safeHostname(prefix, spec.name);

    const types = await client.listInstanceTypes();
    const entries = Object.values(types) as InstanceTypeEntry[];
    const explicitInstanceType =
      (spec.metadata?.machine_type as string | undefined) ??
      (spec.metadata?.instance_type_name as string | undefined);
    let instance_type_name: string;
    if (explicitInstanceType) {
      const match = entries.find(
        (entry) => entry.instance_type?.name === explicitInstanceType,
      );
      if (!match) {
        throw new Error(
          `unknown Lambda instance type ${explicitInstanceType}`,
        );
      }
      const regions =
        (match.regions_with_capacity_available ?? [])
          .map((r) => r.name)
          .filter((r): r is string => !!r) ?? [];
      if (regions.length && !regions.includes(spec.region)) {
        throw new Error(
          `Lambda instance type ${explicitInstanceType} has no capacity in ${spec.region}`,
        );
      }
      instance_type_name = explicitInstanceType;
    } else {
      instance_type_name = selectInstanceType(entries, spec.region, spec);
    }

    // Lambda defaults to Ubuntu 22.04 when no image is specified, so only set
    // an explicit image if the user chose one via metadata.
    let image: { id?: string; family?: string } | undefined;
    if (
      spec.metadata?.source_image_id ||
      spec.metadata?.source_image ||
      spec.metadata?.image_family ||
      spec.metadata?.source_image_family
    ) {
      const images = (await client.listImages()) as ImageEntry[];
      image = selectImage(images, spec);
    }

    const sshName = await ensureSshKey(
      client,
      `${resourceName}-ssh`,
      creds.sshPublicKey,
    );

    const filesystemName = spec.metadata?.filesystem_name;
    const filesystemMount = spec.metadata?.filesystem_mount_point ?? "/btrfs";
    let file_system_names: string[] | undefined;
    let file_system_mounts: Array<{ name: string; mount_point: string }> | undefined;
    if (filesystemName) {
      await ensureFilesystem(client, filesystemName, spec.region);
      file_system_names = [filesystemName];
      file_system_mounts = [{ name: filesystemName, mount_point: filesystemMount }];
    }

    const user_data = buildUserData(spec);

    const payload: any = {
      region_name: spec.region,
      instance_type_name,
      ssh_key_names: [sshName],
      ...(image ? { image } : {}),
      hostname,
      name: spec.name,
      user_data,
      file_system_names,
      file_system_mounts,
    };

    const result = await client.launchInstance(payload);
    const instance_id = result?.instance_ids?.[0];
    if (!instance_id) {
      throw new Error("Lambda did not return instance_id");
    }
    let instance: any;
    try {
      instance = await client.getInstance(instance_id);
    } catch {}

    const runtime: HostRuntime = {
      provider: "lambda",
      instance_id,
      public_ip: instance?.ip,
      ssh_user: spec.metadata?.ssh_user ?? "ubuntu",
      zone: spec.region,
      metadata: {
        instance_type_name,
        image,
        filesystem_name: filesystemName,
      },
    };
    logger.info("lambda.createHost", { region: spec.region, instance_type_name });
    return runtime;
  }

  async startHost(runtime: HostRuntime, creds: LambdaCreds): Promise<void> {
    const client = new LambdaClient({ apiKey: creds.apiKey });
    await client.restartInstance([runtime.instance_id]);
  }

  async stopHost(runtime: HostRuntime, creds: LambdaCreds): Promise<void> {
    const client = new LambdaClient({ apiKey: creds.apiKey });
    await client.terminateInstance([runtime.instance_id]);
  }

  async deleteHost(runtime: HostRuntime, creds: LambdaCreds): Promise<void> {
    const client = new LambdaClient({ apiKey: creds.apiKey });
    await client.terminateInstance([runtime.instance_id]);
  }

  async resizeDisk(): Promise<void> {
    throw new Error("Lambda disk resize not implemented");
  }

  async getStatus(
    runtime: HostRuntime,
    creds: LambdaCreds,
  ): Promise<"starting" | "running" | "stopped" | "error"> {
    const client = new LambdaClient({ apiKey: creds.apiKey });
    const instance = await client.getInstance(runtime.instance_id);
    switch (instance?.status) {
      case "booting":
        return "starting";
      case "active":
        return "running";
      case "terminated":
      case "terminating":
      case "preempted":
        return "stopped";
      case "unhealthy":
      default:
        return "error";
    }
  }
}
