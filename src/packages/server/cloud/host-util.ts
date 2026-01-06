import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import {
  type HostSpec,
  type NebiusImage,
  normalizeProviderId,
} from "@cocalc/cloud";
import getLogger from "@cocalc/backend/logger";
import { getControlPlaneSshKeypair } from "./ssh-key";
import { getProviderContext, getProviderPrefix } from "./provider-context";
import {
  getServerProvider,
  gcpSafeName,
  loadNebiusImages,
  loadNebiusInstanceTypes,
} from "./providers";

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

async function resolveNebiusPlatform(
  machineType?: string,
): Promise<string | undefined> {
  if (!machineType) return undefined;
  const types = await loadNebiusInstanceTypes();
  const match = types.find((entry) => entry.name === machineType);
  return match?.platform;
}

const isNebiusGpuFamily = (family?: string | null) =>
  !!family && /cuda|nvidia/i.test(family);

const MIN_UBUNTU_VERSION = 2404;

const parseUbuntuVersion = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/ubuntu(\d{2})\.(\d{2})/);
  if (!match) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined;
  return major * 100 + minor;
};

const parseVersionParts = (value?: string | null): number[] | undefined => {
  if (!value) return undefined;
  const parts = value.match(/\d+/g);
  if (!parts?.length) return undefined;
  const nums = parts.map((part) => Number(part)).filter(Number.isFinite);
  return nums.length ? nums : undefined;
};

const compareVersionParts = (a?: number[], b?: number[]): number => {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
};

const imageTimestamp = (img: NebiusImage): number => {
  const value = img.updated_at ?? img.created_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickNebiusImageFamily = (
  images: NebiusImage[],
  wantsGpu: boolean,
  opts: { region?: string; platform?: string | null } = {},
): string | undefined => {
  const regionImages = opts.region
    ? images.filter((img) => !img.region || img.region === opts.region)
    : images;
  const ubuntuImages = regionImages.filter((img) =>
    (img.family ?? "").toLowerCase().includes("ubuntu"),
  );
  const platformImages = opts.platform
    ? ubuntuImages.filter((img) => {
        const recommended = img.recommended_platforms ?? [];
        if (!recommended.length) return true;
        return recommended.includes(opts.platform ?? "");
      })
    : ubuntuImages;
  const versionedImages = platformImages.filter(
    (img) => (parseUbuntuVersion(img.family) ?? 0) >= MIN_UBUNTU_VERSION,
  );
  const candidates = versionedImages.filter((img) =>
    wantsGpu ? isNebiusGpuFamily(img.family) : !isNebiusGpuFamily(img.family),
  );
  const pool = candidates.length ? candidates : versionedImages;
  if (!pool.length) return undefined;
  const sorted = [...pool].sort((a, b) => {
    const driverlessA = /driverless/i.test(a.family ?? "");
    const driverlessB = /driverless/i.test(b.family ?? "");
    if (!wantsGpu && driverlessA !== driverlessB) {
      return driverlessA ? -1 : 1;
    }
    const ubuntuA = parseUbuntuVersion(a.family) ?? 0;
    const ubuntuB = parseUbuntuVersion(b.family) ?? 0;
    if (ubuntuA !== ubuntuB) return ubuntuB - ubuntuA;
    const versionCmp = compareVersionParts(
      parseVersionParts(a.version),
      parseVersionParts(b.version),
    );
    if (versionCmp !== 0) return versionCmp < 0 ? 1 : -1;
    const timeA = imageTimestamp(a);
    const timeB = imageTimestamp(b);
    if (timeA !== timeB) return timeB - timeA;
    return 0;
  });
  return sorted[0]?.family ?? undefined;
};

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
  if (providerId === "self-host" && !row.region) {
    throw new Error("self-host requires connector id in region");
  }
  const prefix = providerId ? await getProviderPrefix(providerId) : "cocalc-host";
  const provider = providerId ? getServerProvider(providerId) : undefined;
  const normalizeName = provider?.normalizeName ?? gcpSafeName;
  const providerName = providerId ? normalizeName(prefix, baseName) : baseName;
  let sourceImage: string | undefined;
  let sourceImageFamily: string | undefined;
  let platform = machine.metadata?.platform;
  const sanitizedMetadata = { ...(machine.metadata ?? {}) };
  delete sanitizedMetadata.source_image;
  delete sanitizedMetadata.source_image_family;
  delete sanitizedMetadata.image_family;
  delete sanitizedMetadata.source_image_id;
  delete sanitizedMetadata.image_id;
  delete sanitizedMetadata.source_image_project;
  if (!platform && providerId === "nebius") {
    platform = await resolveNebiusPlatform(machine.machine_type);
    if (platform) {
      logger.debug("buildHostSpec: resolved nebius platform", {
        host_id: row.id,
        machine_type: machine.machine_type,
        platform,
      });
    } else if (machine.machine_type) {
      logger.warn("buildHostSpec: nebius platform not found", {
        host_id: row.id,
        machine_type: machine.machine_type,
      });
    }
  }
  if (providerId === "nebius") {
    const wantsGpu = !!gpu;
    const images = await loadNebiusImages();
    const family = pickNebiusImageFamily(images, wantsGpu, {
      region: row.region,
      platform,
    });
    if (family) {
      sourceImage = undefined;
      sourceImageFamily = family;
    } else {
      throw new Error(
        `no Nebius Ubuntu ${MIN_UBUNTU_VERSION / 100}+ images available for region ${row.region ?? "unknown"}`,
      );
    }
  }
  logger.debug("buildHostSpec source_image", {
    host_id: row.id,
    machine_source_image: machine.source_image,
    metadata_source_image: machine.metadata?.source_image,
    metadata_source_image_family: machine.metadata?.source_image_family,
    metadata_image_family: machine.metadata?.image_family,
    selected: sourceImage,
    selected_family: sourceImageFamily,
  });

  const imageMetadata: Record<string, string> = {};
  if (sourceImage) imageMetadata.source_image = sourceImage;
  if (sourceImageFamily) imageMetadata.source_image_family = sourceImageFamily;

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
      host_id: row.id,
      ...sanitizedMetadata,
      ...imageMetadata,
      ...(platform ? { platform } : {}),
      machine_type: machine.machine_type,
      bootstrap_url: machine.bootstrap_url,
      startup_script: machine.startup_script,
      storage_mode,
      ssh_public_key: controlPlanePublicKey,
      ssh_user,
    },
  };
  return spec;
}

export async function provisionIfNeeded(
  row: HostRow,
  opts: { startupScript?: string } = {},
) {
  const metadata = row.metadata ?? {};
  const runtime = metadata.runtime;
  const machine: HostMachine = metadata.machine ?? {};
  const providerId = normalizeProviderId(machine.cloud);
  if (!providerId) {
    return row;
  }
  if (runtime?.instance_id) return row;
  const spec = await buildHostSpec(row);
  if (opts.startupScript) {
    spec.metadata = {
      ...(spec.metadata ?? {}),
      startup_script: opts.startupScript,
    };
  }
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
