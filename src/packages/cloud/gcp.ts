import {
  DisksClient,
  ImagesClient,
  InstancesClient,
  ZoneOperationsClient,
} from "@google-cloud/compute";
import logger from "./logger";
import type { CloudProvider, HostRuntime, HostSpec, RemoteInstance } from "./types";

type GcpCredentials = {
  service_account_json?: string;
  // this is the google cloud project_id, not a cocalc project_id
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseCredentials(creds: GcpCredentials) {
  if (creds.service_account_json) {
    try {
      const parsed = JSON.parse(creds.service_account_json);
      return {
        projectId: parsed.project_id,
        credentials: {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        },
        fallback: true,
      };
    } catch (err) {
      throw new Error(`invalid service_account_json: ${err}`);
    }
  }
  if (creds.project_id && creds.client_email && creds.private_key) {
    return {
      projectId: creds.project_id,
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      fallback: true,
    };
  }
  throw new Error("missing GCP credentials");
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: number; status?: number; statusCode?: number; message?: string; details?: string };
  const code = anyErr.code ?? anyErr.status ?? anyErr.statusCode;
  if (code === 404 || code === 5) return true;
  const msg = String(anyErr.message ?? anyErr.details ?? "");
  return /not found/i.test(msg);
}

function diskTypeFor(spec: HostSpec): string {
  switch (spec.disk_type) {
    case "ssd":
      return "pd-ssd";
    case "balanced":
      return "pd-balanced";
    case "standard":
      return "pd-standard";
    default:
      return "pd-balanced";
  }
}

function machineTypeFor(spec: HostSpec): string {
  const override = spec.metadata?.machine_type;
  if (override) return override;
  const memoryMb = Math.max(1024, Math.round(spec.ram_gb * 1024));
  return `n2-custom-${spec.cpu}-${memoryMb}`;
}

function zoneFor(spec: HostSpec): string {
  if (spec.zone) return spec.zone;
  return `${spec.region}-a`;
}

function startupScriptFor(spec: HostSpec): string | undefined {
  const direct = spec.metadata?.startup_script;
  if (direct) return direct;
  const url = spec.metadata?.bootstrap_url;
  if (!url) return undefined;
  return `#!/bin/bash\nset -e\ncurl -fsSL ${url} | bash`;
}

function sshUserFor(spec: HostSpec): string {
  return spec.metadata?.ssh_user ?? "ubuntu";
}

function normalizeSourceImage(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function defaultImageFamilies(_opts?: { gpu?: boolean }): string[] {
  return [
    "ubuntu-2404-lts-amd64",
    "ubuntu-2404-lts",
    "ubuntu-minimal-2404-lts-amd64",
    "ubuntu-minimal-2404-lts",
  ];
}

async function resolveSourceImage({
  spec,
  credentials,
}: {
  spec: HostSpec;
  credentials: { projectId: string; credentials: any };
}): Promise<string> {
  const imagesClient = new ImagesClient(credentials);
  const gpuPreferred = !!spec.gpu;
  const projectOverride = normalizeSourceImage(
    spec.metadata?.source_image_project,
  );
  const projectCandidates = projectOverride
    ? [projectOverride]
    : gpuPreferred
      ? ["ubuntu-os-accelerator-images", "ubuntu-os-cloud"]
      : ["ubuntu-os-cloud", "ubuntu-os-accelerator-images"];

  const direct = normalizeSourceImage(spec.metadata?.source_image);
  if (direct) {
    if (
      direct.startsWith("http://") ||
      direct.startsWith("https://") ||
      direct.startsWith("projects/") ||
      direct.includes("/global/images/")
    ) {
      return direct;
    }
    for (const project of projectCandidates) {
      try {
        const [img] = await imagesClient.get({
          project,
          image: direct,
        });
        if (img?.selfLink) {
          return img.selfLink;
        }
      } catch (err) {
        logger.warn("gcp source_image lookup failed", {
          image: direct,
          project,
          err: String(err),
        });
      }
    }
  }

  const familyOverride =
    normalizeSourceImage(spec.metadata?.source_image_family) ??
    normalizeSourceImage(spec.metadata?.image_family);
  const familyCandidates = familyOverride
    ? [familyOverride]
    : defaultImageFamilies({ gpu: gpuPreferred });
  for (const project of projectCandidates) {
    for (const family of familyCandidates) {
      try {
        const [img] = await imagesClient.getFromFamily({
          project,
          family,
        });
        if (img?.selfLink) {
          return img.selfLink;
        }
      } catch (err) {
        logger.warn("gcp image family lookup failed", {
          family,
          project,
          err: String(err),
        });
      }
    }
  }

  throw new Error(
    `unable to resolve gcp source image (family=${familyOverride ?? "default"})`,
  );
}

async function waitUntilOperationComplete({
  response,
  zone,
  credentials,
}: {
  response: any;
  zone: string;
  credentials: any;
}) {
  let operation = response.latestResponse;
  const operationsClient = new ZoneOperationsClient(credentials);
  while (operation.status !== "DONE") {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: credentials.projectId,
      zone,
    });
  }
}

export class GcpProvider implements CloudProvider {
  mapStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if (normalized === "running") return "running";
    if (
      normalized === "terminated" ||
      normalized === "stopped" ||
      normalized === "stopping"
    )
      return "off";
    return "starting";
  }

  async createHost(spec: HostSpec, creds: any): Promise<HostRuntime> {
    const logMetadata = { ...(spec.metadata ?? {}) } as Record<string, unknown>;
    delete logMetadata.startup_script;
    delete logMetadata.bootstrap_url;
    delete logMetadata.user_data;
    logger.info("gcp.createHost", {
      name: spec.name,
      region: spec.region,
      zone: spec.zone,
      disk_gb: spec.disk_gb,
      gpu: spec.gpu?.type ?? "none",
      metadata: logMetadata,
    });
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials) as InstancesClient & {
      googleProjectId: string;
    };
    client.googleProjectId = credentials.projectId;

    const zone = zoneFor(spec);
    const machineType = `zones/${zone}/machineTypes/${machineTypeFor(spec)}`;
    const diskType = `projects/${credentials.projectId}/zones/${zone}/diskTypes/${diskTypeFor(
      spec,
    )}`;
    const sourceImage = await resolveSourceImage({ spec, credentials });
    const bootDiskGb =
      spec.metadata?.boot_disk_gb ??
      spec.metadata?.bootDiskGb ??
      (spec.gpu ? 20 : 10);

    const storageMode = spec.metadata?.storage_mode;
    type Disk = {
      autoDelete: boolean;
      boot: boolean;
      type?: string;
      interface?: string;
      deviceName?: string;
      initializeParams?: {
        diskType: string;
        diskSizeGb?: string;
        sourceImage?: any;
        diskName?: string;
      };
      source?: string;
    };
    const disks: Disk[] = [
      {
        autoDelete: true,
        boot: true,
        initializeParams: {
          diskSizeGb: `${bootDiskGb}`,
          diskType,
          sourceImage,
        },
      },
    ];
    const dataDiskName = spec.metadata?.data_disk_name ?? `${spec.name}-data`;
    let dataDiskSource: string | undefined;
    if (storageMode === "ephemeral") {
      // Attach one local SSD for fast ephemeral storage.
      disks.push({
        autoDelete: true,
        boot: false,
        type: "SCRATCH",
        interface: "NVME",
        initializeParams: {
          diskType: `projects/${credentials.projectId}/zones/${zone}/diskTypes/local-ssd`,
        },
      });
    } else {
      const diskClient = new DisksClient(credentials);
      try {
        const [disk] = await diskClient.get({
          project: credentials.projectId,
          zone,
          disk: dataDiskName,
        });
        dataDiskSource = disk?.selfLink ?? undefined;
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
      }
      disks.push({
        autoDelete: false,
        boot: false,
        deviceName: dataDiskName,
        ...(dataDiskSource
          ? { source: dataDiskSource }
          : {
              initializeParams: {
                diskName: dataDiskName,
                diskSizeGb: `${spec.disk_gb}`,
                diskType,
              },
            }),
      });
    }

    const networkInterfaces = [
      {
        accessConfigs: [
          {
            name: "External NAT",
            networkTier: "PREMIUM",
          },
        ],
        stackType: "IPV4_ONLY",
        subnetwork: `projects/${credentials.projectId}/regions/${spec.region}/subnetworks/default`,
      },
    ];

    const metadataItems: { key: string; value: string }[] = [];
    const startupScript = startupScriptFor(spec);
    if (startupScript) {
      metadataItems.push({ key: "startup-script", value: startupScript });
    }
    const sshPublicKey = spec.metadata?.ssh_public_key;
    if (sshPublicKey) {
      const sshUser = sshUserFor(spec);
      metadataItems.push({
        key: "ssh-keys",
        value: `${sshUser}:${sshPublicKey}`,
      });
    }

    const guestAccelerators = spec.gpu
      ? [
          {
            acceleratorCount: Math.max(1, spec.gpu.count ?? 1),
            acceleratorType: `projects/${credentials.projectId}/zones/${zone}/acceleratorTypes/${spec.gpu.type}`,
          },
        ]
      : [];
    const scheduling = spec.gpu
      ? { onHostMaintenance: "TERMINATE", automaticRestart: true }
      : undefined;

    const instanceResource = {
      name: spec.name,
      disks,
      machineType,
      networkInterfaces,
      metadata: metadataItems.length ? { items: metadataItems } : undefined,
      guestAccelerators,
      tags: spec.tags ? { items: spec.tags } : undefined,
      scheduling,
    };

    const [response] = await client.insert({
      project: credentials.projectId,
      zone,
      instanceResource,
    });
    logger.debug("gcp.createHost insert submitted", {
      project: credentials.projectId,
      zone,
      name: spec.name,
    });
    await waitUntilOperationComplete({
      response,
      zone,
      credentials,
    });

    const [instance] = await client.get({
      project: credentials.projectId,
      zone,
      instance: spec.name,
    });

    const publicIp =
      instance?.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? "";
    return {
      provider: "gcp",
      instance_id: spec.name,
      public_ip: publicIp,
      ssh_user: "ubuntu",
      zone,
      metadata: {
        machine_type: machineType,
        disk_type: diskType,
        boot_disk_gb: bootDiskGb,
        data_disk_gb: spec.disk_gb,
        data_disk_name: dataDiskName,
        data_disk_uri: dataDiskSource,
        ssh_public_key: spec.metadata?.ssh_public_key,
        ssh_user: sshUserFor(spec),
      },
    };
  }

  async startHost(runtime: HostRuntime, creds: any): Promise<void> {
    logger.info("gcp.startHost", {
      instance_id: runtime.instance_id,
      zone: runtime.zone,
    });
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) {
      throw new Error("gcp.startHost requires zone");
    }
    const client = new InstancesClient(credentials);
    await ensureSshMetadata(runtime, credentials, client);
    const [response] = await client.start({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
    await waitUntilOperationComplete({
      response,
      zone: runtime.zone,
      credentials,
    });
  }

  async stopHost(runtime: HostRuntime, creds: any): Promise<void> {
    logger.info("gcp.stopHost", {
      instance_id: runtime.instance_id,
      zone: runtime.zone,
    });
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) {
      throw new Error("gcp.stopHost requires zone");
    }
    const client = new InstancesClient(credentials);
    const [response] = await client.stop({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
    await waitUntilOperationComplete({
      response,
      zone: runtime.zone,
      credentials,
    });
  }

  async hardRestartHost(runtime: HostRuntime, creds: any): Promise<void> {
    logger.info("gcp.hardRestartHost", {
      instance_id: runtime.instance_id,
      zone: runtime.zone,
    });
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) {
      throw new Error("gcp.hardRestartHost requires zone");
    }
    const client = new InstancesClient(credentials);
    const [response] = await client.reset({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
    await waitUntilOperationComplete({
      response,
      zone: runtime.zone,
      credentials,
    });
  }

  async deleteHost(
    runtime: HostRuntime,
    creds: any,
    opts?: { preserveDataDisk?: boolean },
  ): Promise<void> {
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) {
      throw new Error("gcp.deleteHost requires zone");
    }
    const client = new InstancesClient(credentials);
    const diskClient = new DisksClient(credentials);
    let dataDiskName: string | undefined;
    try {
      try {
        const [instance] = await client.get({
          project: credentials.projectId,
          zone: runtime.zone,
          instance: runtime.instance_id,
        });
        const disks = instance?.disks ?? [];
        const dataDisk =
          disks.find((disk) => !disk.boot && disk.type !== "SCRATCH") ??
          disks.find((disk) => !disk.boot);
        dataDiskName =
          dataDisk?.deviceName ??
          (dataDisk?.source ? dataDisk.source.split("/").pop() : undefined);
        if (opts?.preserveDataDisk && dataDiskName) {
          await client.setDiskAutoDelete({
            project: credentials.projectId,
            zone: runtime.zone,
            instance: runtime.instance_id,
            deviceName: dataDiskName,
            autoDelete: false,
          });
        }
      } catch (err) {
        logger.warn("gcp.deleteHost data disk lookup failed", {
          instance_id: runtime.instance_id,
          zone: runtime.zone,
          err,
        });
      }
      const [response] = await client.delete({
        project: credentials.projectId,
        zone: runtime.zone,
        instance: runtime.instance_id,
      });
      await waitUntilOperationComplete({
        response,
        zone: runtime.zone,
        credentials,
      });
      if (!opts?.preserveDataDisk && dataDiskName) {
        try {
          const [diskResponse] = await diskClient.delete({
            project: credentials.projectId,
            zone: runtime.zone,
            disk: dataDiskName,
          });
          await waitUntilOperationComplete({
            response: diskResponse,
            zone: runtime.zone,
            credentials,
          });
        } catch (err) {
          if (!isNotFoundError(err)) {
            logger.warn("gcp.deleteHost data disk delete failed", {
              instance_id: runtime.instance_id,
              zone: runtime.zone,
              disk: dataDiskName,
              err,
            });
          }
        }
      }
    } catch (err) {
      if (isNotFoundError(err)) {
        logger.info("gcp.deleteHost: instance already gone", {
          instance_id: runtime.instance_id,
          zone: runtime.zone,
        });
        return;
      }
      throw err;
    }
  }

  async resizeDisk(
    runtime: HostRuntime,
    newSizeGb: number,
    creds: any,
  ): Promise<void> {
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) {
      throw new Error("gcp.resizeDisk requires zone");
    }
    const diskClient = new DisksClient(credentials);
    const instanceClient = new InstancesClient(credentials);
    const runtimeMetadata = runtime.metadata as
      | { data_disk_name?: string; data_disk_uri?: string }
      | undefined;
    let diskName = runtimeMetadata?.data_disk_name;
    if (!diskName && runtimeMetadata?.data_disk_uri) {
      diskName = runtimeMetadata.data_disk_uri.split("/").pop();
    }
    if (!diskName) {
      const [instance] = await instanceClient.get({
        project: credentials.projectId,
        zone: runtime.zone,
        instance: runtime.instance_id,
      });
      const disks = instance?.disks ?? [];
      const dataDisk =
        disks.find((disk) => !disk.boot && disk.type !== "SCRATCH") ??
        disks.find((disk) => !disk.boot) ??
        disks[0];
      const source = dataDisk?.source ?? "";
      diskName = source.split("/").pop();
    }
    if (!diskName) {
      throw new Error("gcp.resizeDisk could not determine disk name");
    }
    const [response] = await diskClient.resize({
      project: credentials.projectId,
      zone: runtime.zone,
      disk: diskName,
      disksResizeRequestResource: { sizeGb: newSizeGb },
    });
    await waitUntilOperationComplete({
      response,
      zone: runtime.zone,
      credentials,
    });
  }

  async getStatus(
    runtime: HostRuntime,
    creds: any,
  ): Promise<"starting" | "running" | "stopped" | "error"> {
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials);
    const [response] = await client.get({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
    const status = response?.status ?? "UNKNOWN";
    if (status === "RUNNING") return "running";
    if (status === "TERMINATED") return "stopped";
    if (status === "PROVISIONING" || status === "STAGING") return "starting";
    if (status === "STOPPING") return "stopped";
    return "error";
  }

  async listInstances(
    creds: any,
    opts?: { namePrefix?: string },
  ): Promise<RemoteInstance[]> {
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials);
    const instances: RemoteInstance[] = [];
    for await (const [zoneName, scopedList] of client.aggregatedListAsync({
      project: credentials.projectId,
    })) {
      const zone = (zoneName ?? "").split("/").pop();
      const entries = scopedList?.instances ?? [];
      for (const inst of entries) {
        const name = inst.name ?? "";
        if (opts?.namePrefix && !name.startsWith(opts.namePrefix)) continue;
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

  async getInstance(
    runtime: HostRuntime,
    creds: any,
  ): Promise<RemoteInstance | undefined> {
    const credentials = parseCredentials(creds ?? {});
    if (!runtime.zone) return undefined;
    const client = new InstancesClient(credentials);
    const [instance] = await client.get({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
    if (!instance) return undefined;
    const public_ip =
      instance?.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? undefined;
    return {
      instance_id: runtime.instance_id,
      name: instance.name ?? runtime.instance_id,
      status: instance.status ?? undefined,
      zone: runtime.zone,
      public_ip,
    };
  }
}

async function ensureSshMetadata(
  runtime: HostRuntime,
  credentials: { projectId: string; credentials: any },
  client: InstancesClient,
): Promise<void> {
  const sshPublicKey = runtime.metadata?.ssh_public_key;
  if (!sshPublicKey) return;
  const sshUser = runtime.metadata?.ssh_user ?? "ubuntu";
  const [instance] = await client.get({
    project: credentials.projectId,
    zone: runtime.zone,
    instance: runtime.instance_id,
  });
  const fingerprint = instance?.metadata?.fingerprint;
  if (!fingerprint) return;
  const items = instance?.metadata?.items ?? [];
  const entry = `${sshUser}:${sshPublicKey}`;
  const current = items.find((item) => item.key === "ssh-keys");
  if (current?.value?.includes(entry)) return;
  const nextValue = current?.value
    ? `${current.value}\n${entry}`
    : entry;
  const nextItems = items.filter((item) => item.key !== "ssh-keys");
  nextItems.push({ key: "ssh-keys", value: nextValue });
  await client.setMetadata({
    project: credentials.projectId,
    zone: runtime.zone,
    instance: runtime.instance_id,
    metadataResource: {
      fingerprint,
      items: nextItems,
    },
  });
}
