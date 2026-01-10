import type { HostSpec, HostRuntime, CloudProvider, RemoteInstance } from "../types";
import getLogger from "@cocalc/backend/logger";
import {
  createVirtualMachines,
  deleteVirtualMachine,
  getEnvironments,
  getFlavors,
  getImages,
  getKeyPairs,
  getVirtualMachine,
  getVirtualMachines,
  startVirtualMachine,
  hardRebootVirtualMachine,
  importKeyPair,
  createEnvironment,
  addFirewallRule,
  createVolume,
  getVolumes,
  attachVolume,
} from "./client";
import { getHyperstackConfig, setHyperstackConfig } from "./config";
import type {
  Region,
  FlavorRegionData,
  Image,
  Protocol,
  VolumeDetails,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { delay } from "awaiting";

const logger = getLogger("cloud:hyperstack:provider");
const NAME_NOT_AVAILABLE_RE = /name is not available/i;
const DELETE_WAIT_MS = 5 * 60 * 1000;
const DELETE_POLL_MS = 5000;

const SECURITY_RULES = [
  { port_range_min: 22, port_range_max: 22, protocol: "tcp" as Protocol }, // ssh bootstrap
  { port_range_min: 2222, port_range_max: 2222, protocol: "tcp" as Protocol }, // project-host ssh server
];

const MIN_UBUNTU_VERSION = 2404;
type HyperstackImageEntry = Image["images"][number];

function parseUbuntuVersion(value?: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.match(/([0-9]{2})[._-]?([0-9]{2})/);
  if (!match) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined;
  return major * 100 + minor;
}

function imageUbuntuVersion(img: HyperstackImageEntry): number {
  return parseUbuntuVersion(img.version) ?? 0;
}

function isCudaImage(img: HyperstackImageEntry): boolean {
  return /cuda/i.test(img.version ?? "");
}

export type HyperstackCreds = {
  apiKey: string;
  sshPublicKey: string;
  prefix?: string;
  catalog?: {
    flavors?: FlavorRegionData[];
    images?: Image[];
  };
};

function ensureHyperstackConfig(creds: HyperstackCreds) {
  setHyperstackConfig({ apiKey: creds.apiKey, prefix: creds.prefix });
}

function normalizePrefix(prefix?: string): string {
  const value = (prefix ?? "cocalc").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return value.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "cocalc";
}

function envName(region: string): string {
  const { prefix } = getHyperstackConfig();
  return `${normalizePrefix(prefix)}-${region
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")}`;
}

async function waitForHyperstackDelete(id: number): Promise<void> {
  const attempts = Math.ceil(DELETE_WAIT_MS / DELETE_POLL_MS);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const vm = await getVirtualMachine(id);
      logger.debug("Hyperstack delete wait: still present", {
        id,
        status: vm?.status,
        attempt,
      });
    } catch (err) {
      const message = String(err).toLowerCase();
      if (
        message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("no such")
      ) {
        return;
      }
      logger.warn("Hyperstack delete wait: transient error", {
        id,
        err: String(err),
        attempt,
      });
    }
    await delay(DELETE_POLL_MS);
  }
  logger.warn("Hyperstack delete wait timed out", { id });
}

function keyName(region: string): string {
  const { prefix } = getHyperstackConfig();
  return `${normalizePrefix(prefix)}-host-${region
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")}`;
}

async function ensureEnvironment(region: string): Promise<string> {
  const name = envName(region);
  logger.debug("ensureEnvironment", { region, name });
  const envs = await getEnvironments();
  if (envs.find((e) => (e.name ?? "").toLowerCase() === name.toLowerCase())) {
    logger.debug("ensureEnvironment: exists", { name });
    return name;
  }
  try {
    logger.info("ensureEnvironment: creating", { name, region });
    await createEnvironment({ name, region: region as Region });
  } catch (err) {
    if (!isAlreadyExists(err)) {
      throw err;
    }
    logger.info("ensureEnvironment: already exists", { name });
  }

  const deadline = Date.now() + 2 * 60 * 1000;
  let wait = 500;
  while (Date.now() < deadline) {
    const next = await getEnvironments();
    if (next.find((e) => (e.name ?? "").toLowerCase() === name.toLowerCase())) {
      logger.debug("ensureEnvironment: ready", { name });
      return name;
    }
    await delay(wait);
    wait = Math.min(wait * 1.5, 5000);
  }
  throw new Error(`Hyperstack environment "${name}" not ready in time`);
}

async function ensureKeyPair(
  region: string,
  publicKey: string,
): Promise<string> {
  const name = keyName(region);
  logger.debug("ensureKeyPair", { region, name });
  const keys = await getKeyPairs();
  if (keys.find((k) => k.name === name)) return name;
  logger.info("ensureKeyPair: importing", { name });
  await importKeyPair({
    name,
    environment_name: envName(region),
    public_key: publicKey,
  });
  return name;
}

function isAlreadyExists(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  return (
    msg.toLowerCase().includes("already exists") ||
    (err as any)?.error_reason === "already_exist"
  );
}

async function selectFlavor(
  region: string,
  spec: HostSpec,
  catalogFlavors?: FlavorRegionData[],
): Promise<string> {
  const flavors = catalogFlavors ?? (await getFlavors());
  const regionFlavors = flavors
    .filter((entry) => entry.region_name === region)
    .flatMap((entry) => entry.flavors ?? []);

  const selectedFlavor = spec.metadata?.machine_type;
  if (selectedFlavor) {
    const exact = regionFlavors.find((flavor) => flavor.name === selectedFlavor);
    if (exact) return exact.name;
    logger.warn("selectFlavor: requested flavor not found in region", {
      region,
      flavor: selectedFlavor,
      available: regionFlavors.map((f) => f.name),
    });
  }

  const wantsGpu = !!spec.gpu;
  const gpuType = spec.gpu?.type;
  logger.debug("selectFlavor", { wantsGpu, gpuType, spec });
  const candidates = regionFlavors.filter((flavor) => {
    if (wantsGpu) {
      if (!flavor.gpu || flavor.gpu_count <= 0) return false;
      if (gpuType && flavor.gpu != gpuType) return false;
      if (spec.gpu?.count && flavor.gpu_count < spec.gpu.count) return false;
    } else if (flavor.gpu_count > 0) {
      return false;
    }
    return flavor.cpu >= spec.cpu && flavor.ram >= spec.ram_gb;
  });

  const sorted = candidates.sort((a, b) => {
    if (a.cpu !== b.cpu) return a.cpu - b.cpu;
    return a.ram - b.ram;
  });
  if (!sorted.length) {
    throw new Error(
      `no matching Hyperstack flavor for ${region} -- spec=${JSON.stringify({ cpu: spec.cpu, gpu: spec.gpu, ram_gb: spec.ram_gb })}`,
    );
  }
  return sorted[0].name;
}

async function selectImage(
  region: string,
  spec: HostSpec,
  catalogImages?: Image[],
): Promise<string> {
  if (spec.metadata?.source_image) return spec.metadata.source_image;
  const images =
    catalogImages ?? (await getImages(true, { region: region as Region }));
  const ubuntu = images.find(
    (i) => i.type === "Ubuntu" && i.region_name === region,
  );
  const list = ubuntu?.images ?? [];
  const versioned = list.filter(
    (img) => imageUbuntuVersion(img) >= MIN_UBUNTU_VERSION,
  );
  if (!versioned.length) {
    throw new Error(`no Hyperstack Ubuntu ${MIN_UBUNTU_VERSION / 100}+ images for ${region}`);
  }
  const wantsGpu = !!spec.gpu;
  const cpuPreferred = versioned.filter((img) => !isCudaImage(img));
  const gpuPreferred = versioned.filter(isCudaImage);
  const pool = wantsGpu
    ? gpuPreferred.length
      ? gpuPreferred
      : versioned
    : cpuPreferred.length
      ? cpuPreferred
      : versioned;
  const sorted = [...pool].sort((a, b) => {
    const versionDelta = imageUbuntuVersion(b) - imageUbuntuVersion(a);
    if (versionDelta !== 0) return versionDelta;
    return (b.version ?? "").localeCompare(a.version ?? "");
  });
  if (sorted.length) return sorted[0].name;
  throw new Error(`no Hyperstack Ubuntu images for ${region}`);
}

function parseInstanceId(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`invalid Hyperstack instance id ${value}`);
  }
  return num;
}

function dataVolumeName(spec: HostSpec): string {
  return `${spec.name}-data`;
}

async function findDataVolume(
  environment_name: string,
  name: string,
): Promise<VolumeDetails | undefined> {
  const volumes = await getVolumes();
  return volumes.find(
    (volume) =>
      volume.name === name && volume.environment?.name === environment_name,
  );
}

async function findDataVolumeById(
  environment_name: string,
  id: number,
): Promise<VolumeDetails | undefined> {
  const volumes = await getVolumes();
  return volumes.find(
    (volume) => volume.id === id && volume.environment?.name === environment_name,
  );
}

async function ensureDataVolume(
  environment_name: string,
  spec: HostSpec,
): Promise<VolumeDetails> {
  const name = dataVolumeName(spec);
  const existing = await findDataVolume(environment_name, name);
  if (existing) return existing;
  const sizeGb = Math.max(1, Math.ceil(spec.disk_gb));
  try {
    return await createVolume({ name, size: sizeGb, environment_name });
  } catch (err) {
    if (!isAlreadyExists(err)) {
      throw err;
    }
  }
  const retry = await findDataVolume(environment_name, name);
  if (retry) return retry;
  throw new Error(`Hyperstack volume "${name}" not found after create`);
}

async function attachDataVolume(
  instanceId: number,
  volumeId: number,
): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000;
  let wait = 3000;
  while (Date.now() < deadline) {
    try {
      await attachVolume({
        virtual_machine_id: instanceId,
        volume_ids: [volumeId],
      });
      logger.debug("attachDataVolume: attached", { instanceId, volumeId });
      return;
    } catch (err) {
      const message = String((err as Error)?.message ?? err).toLowerCase();
      if (message.includes("already") && message.includes("attach")) {
        logger.debug("attachDataVolume: already attached", {
          instanceId,
          volumeId,
        });
        return;
      }
      if (message.includes("not_found")) {
        throw err;
      }
      logger.debug("attachDataVolume: retrying", {
        instanceId,
        volumeId,
        err: String((err as Error)?.message ?? err),
      });
    }
    await delay(wait);
    wait = Math.min(Math.floor(wait * 1.3), 10000);
  }
  throw new Error(
    `Hyperstack volume ${volumeId} failed to attach to VM ${instanceId}`,
  );
}

export class HyperstackProvider implements CloudProvider {
  mapStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if (normalized === "active" || normalized === "running") return "running";
    if (normalized === "shutoff" || normalized === "stopped") return "off";
    if (normalized === "error") return "error";
    return "starting";
  }

  async createHost(
    spec: HostSpec,
    creds: HyperstackCreds,
  ): Promise<HostRuntime> {
    logger.debug("HyperstackProvider: createHost", {
      name: spec.name,
      region: spec.region,
      zone: spec.zone,
      cpu: spec.cpu,
      ram_gb: spec.ram_gb,
      disk_gb: spec.disk_gb,
      gpu: spec.gpu,
    });
    ensureHyperstackConfig(creds);
    const region = spec.region;
    const environment_name = await ensureEnvironment(region);
    const key_name = await ensureKeyPair(region, creds.sshPublicKey);
    const flavor_name = await selectFlavor(
      region,
      spec,
      creds.catalog?.flavors,
    );
    const image_name = await selectImage(region, spec, creds.catalog?.images);
    const metadata = spec.metadata ?? {};
    const dataVolumeId = Number(metadata.data_volume_id);
    const dataVolumeName =
      typeof metadata.data_volume_name === "string" && metadata.data_volume_name
        ? metadata.data_volume_name
        : undefined;
    let dataVolume: VolumeDetails | undefined;
    if (Number.isFinite(dataVolumeId) && dataVolumeId > 0) {
      dataVolume = await findDataVolumeById(environment_name, dataVolumeId);
    }
    if (!dataVolume && dataVolumeName) {
      dataVolume = await findDataVolume(environment_name, dataVolumeName);
    }
    if (!dataVolume) {
      dataVolume = await ensureDataVolume(environment_name, spec);
    }
    const user_data =
      typeof spec.metadata?.startup_script === "string"
        ? spec.metadata.startup_script
        : undefined;

    const createParams = {
      name: spec.name,
      environment_name,
      flavor_name,
      key_name,
      image_name,
      assign_floating_ip: true,
      security_rules: SECURITY_RULES,
      user_data,
    };
    let instances: any[] | undefined;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        instances = await createVirtualMachines(createParams);
        break;
      } catch (err) {
        const message = String(err);
        if (NAME_NOT_AVAILABLE_RE.test(message) && attempt < 12) {
          logger.warn("Hyperstack createHost name not available; retrying", {
            name: spec.name,
            attempt,
          });
          await delay(DELETE_POLL_MS);
          continue;
        }
        throw err;
      }
    }
    if (!instances) {
      throw new Error("Hyperstack did not return a VM instance");
    }
    const instance = instances[0];
    if (!instance) {
      throw new Error("Hyperstack did not return a VM instance");
    }
    try {
      await attachDataVolume(Number(instance.id), dataVolume.id);
    } catch (err) {
      logger.warn("Hyperstack attachDataVolume failed", {
        instanceId: instance.id,
        volumeId: dataVolume.id,
        err: String(err),
      });
    }
    for (const rule of SECURITY_RULES) {
      try {
        await addFirewallRule({
          virtual_machine_id: Number(instance.id),
          ...rule,
        });
      } catch (err) {
        if (!isAlreadyExists(err)) {
          logger.warn("Hyperstack addFirewallRule failed", {
            instance_id: instance.id,
            rule,
            err: String(err),
          });
        }
      }
    }
    const runtime: HostRuntime = {
      provider: "hyperstack",
      instance_id: String(instance.id),
      public_ip: instance.floating_ip ?? undefined,
      ssh_user: "ubuntu",
      zone: region,
      metadata: {
        environment_name,
        flavor_name,
        image_name,
        data_volume_id: dataVolume.id,
        data_volume_name: dataVolume.name,
      },
    };
    logger.info("Hyperstack createHost", { region, flavor_name, image_name });
    return runtime;
  }

  async startHost(runtime: HostRuntime, creds: HyperstackCreds): Promise<void> {
    logger.debug("HyperstackProvider: startHost", runtime);
    ensureHyperstackConfig(creds);
    await startVirtualMachine(parseInstanceId(runtime.instance_id));
  }

  async stopHost(runtime: HostRuntime, creds: HyperstackCreds): Promise<void> {
    logger.debug("HyperstackProvider: stopHost", runtime);
    ensureHyperstackConfig(creds);
    const id = parseInstanceId(runtime.instance_id);
    await deleteVirtualMachine(id);
    await waitForHyperstackDelete(id);
  }

  async hardRestartHost(
    runtime: HostRuntime,
    creds: HyperstackCreds,
  ): Promise<void> {
    logger.debug("HyperstackProvider: hardRestartHost", runtime);
    ensureHyperstackConfig(creds);
    await hardRebootVirtualMachine(parseInstanceId(runtime.instance_id));
  }

  async deleteHost(
    runtime: HostRuntime,
    creds: HyperstackCreds,
  ): Promise<void> {
    logger.debug("HyperstackProvider: deleteHost", runtime);
    ensureHyperstackConfig(creds);
    const id = parseInstanceId(runtime.instance_id);
    await deleteVirtualMachine(id);
    await waitForHyperstackDelete(id);
  }

  async resizeDisk(): Promise<void> {
    throw new Error("Hyperstack disk resize not implemented");
  }

  async getStatus(): Promise<"starting" | "running" | "stopped" | "error"> {
    throw new Error("Hyperstack getStatus not implemented");
  }

  async listInstances(
    creds: HyperstackCreds,
    opts?: { namePrefix?: string },
  ): Promise<RemoteInstance[]> {
    ensureHyperstackConfig(creds);
    const list = await getVirtualMachines();
    return list
      .filter((vm) =>
        opts?.namePrefix ? vm.name?.startsWith(opts.namePrefix) : true,
      )
      .map((vm) => ({
        instance_id: String(vm.id),
        name: vm.name,
        status: vm.status,
        zone: vm.environment?.name,
        public_ip: vm.floating_ip ?? undefined,
      }));
  }

  async getInstance(
    runtime: HostRuntime,
    creds: HyperstackCreds,
  ): Promise<RemoteInstance | undefined> {
    ensureHyperstackConfig(creds);
    const instance = await getVirtualMachine(parseInstanceId(runtime.instance_id));
    if (!instance) return undefined;
    return {
      instance_id: runtime.instance_id,
      name: instance.name,
      status: instance.status,
      zone: instance.environment?.name,
      public_ip: instance.floating_ip ?? undefined,
    };
  }
}
