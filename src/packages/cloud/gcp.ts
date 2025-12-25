import { InstancesClient, ZoneOperationsClient } from "@google-cloud/compute";
import logger from "./logger";
import type { CloudProvider, HostRuntime, HostSpec } from "./types";

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
  async createHost(spec: HostSpec, creds: any): Promise<HostRuntime> {
    logger.info("gcp.createHost", {
      name: spec.name,
      region: spec.region,
      zone: spec.zone,
      disk_gb: spec.disk_gb,
      gpu: spec.gpu?.type ?? "none",
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
    const sourceImage =
      spec.metadata?.source_image ??
      "projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts";
    const bootDiskGb = spec.metadata?.boot_disk_gb ?? 20;

    const disks = [
      {
        autoDelete: true,
        boot: true,
        initializeParams: {
          diskSizeGb: `${bootDiskGb}`,
          diskType,
          sourceImage,
        },
      },
      {
        autoDelete: true,
        boot: false,
        deviceName: `${spec.name}-data`,
        initializeParams: {
          diskSizeGb: `${spec.disk_gb}`,
          diskType,
        },
      },
    ];

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

    const guestAccelerators = spec.gpu
      ? [
          {
            acceleratorCount: Math.max(1, spec.gpu.count ?? 1),
            acceleratorType: `projects/${credentials.projectId}/zones/${zone}/acceleratorTypes/${spec.gpu.type}`,
          },
        ]
      : [];

    const instanceResource = {
      name: spec.name,
      disks,
      machineType,
      networkInterfaces,
      metadata: metadataItems.length ? { items: metadataItems } : undefined,
      guestAccelerators,
      tags: spec.tags ? { items: spec.tags } : undefined,
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
      },
    };
  }

  async startHost(runtime: HostRuntime, creds: any): Promise<void> {
    logger.info("gcp.startHost", {
      instance_id: runtime.instance_id,
      zone: runtime.zone,
    });
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials);
    await client.start({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
  }

  async stopHost(runtime: HostRuntime, creds: any): Promise<void> {
    logger.info("gcp.stopHost", {
      instance_id: runtime.instance_id,
      zone: runtime.zone,
    });
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials);
    await client.stop({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
  }

  async deleteHost(runtime: HostRuntime, creds: any): Promise<void> {
    const credentials = parseCredentials(creds ?? {});
    const client = new InstancesClient(credentials);
    await client.delete({
      project: credentials.projectId,
      zone: runtime.zone,
      instance: runtime.instance_id,
    });
  }

  async resizeDisk(
    _runtime: HostRuntime,
    _newSizeGb: number,
    _creds: any,
  ): Promise<void> {
    throw new Error("resizeDisk not implemented yet");
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
}
