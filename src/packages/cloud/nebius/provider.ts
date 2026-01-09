import type {
  CloudProvider,
  HostRuntime,
  HostSpec,
  RemoteInstance,
} from "../types";
import getLogger from "@cocalc/backend/logger";
import { NebiusClient, type NebiusCreds } from "./client";
import {
  AttachedDiskSpec,
  AttachedDiskSpec_AttachMode,
  CreateDiskRequest,
  CreateInstanceRequest,
  DeleteDiskRequest,
  DeleteInstanceRequest,
  DiskSpec,
  DiskSpec_DiskType,
  ExistingDisk,
  GetInstanceRequest,
  InstanceRecoveryPolicy,
  InstanceSpec,
  InstanceStatus_InstanceState,
  IPAddress,
  ListDisksRequest,
  ListInstancesRequest,
  NetworkInterfaceSpec,
  PublicIPAddress,
  ResourcesSpec,
  SourceImageFamily,
  StartInstanceRequest,
  StopInstanceRequest,
  UpdateDiskRequest,
} from "@nebius/js-sdk/api/nebius/compute/v1/index";
import { ResourceMetadata } from "@nebius/js-sdk/api/nebius/common/v1/index";
import { Long } from "@nebius/js-sdk/runtime/protos/index";

const logger = getLogger("cloud:nebius:provider");

type NebiusRuntimeMeta = {
  diskIds?: {
    boot?: string;
    data?: string;
  };
  diskTypeCode?: number;
  subnetId?: string;
};

function sanitizeName(base: string, maxLen = 63): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  let safeBase = clean(base);
  if (!safeBase) return "cocalc";
  if (safeBase.length > maxLen) {
    safeBase = safeBase.slice(0, maxLen).replace(/-+$/g, "");
  }
  return safeBase || "cocalc";
}

function diskTypeFor(spec: HostSpec): DiskSpec_DiskType {
  if (spec.disk_type === "standard") return DiskSpec_DiskType.NETWORK_HDD;
  if (spec.disk_type === "ssd_io_m3") {
    return DiskSpec_DiskType.NETWORK_SSD_IO_M3;
  }
  return DiskSpec_DiskType.NETWORK_SSD;
}

function blockSizeBytes(): Long {
  return Long.fromNumber(4096);
}

function diskTypeFromCode(code?: number): DiskSpec_DiskType {
  if (code == null) return DiskSpec_DiskType.NETWORK_SSD;
  return DiskSpec_DiskType.fromNumber(code);
}

function normalizeIp(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const [ip] = trimmed.split("/");
  return ip || undefined;
}

function isAlreadyExistsError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err);
  const code = (err as any)?.code;
  return (
    message.includes("ALREADY_EXISTS") ||
    message.toLowerCase().includes("already exists") ||
    code === "ALREADY_EXISTS" ||
    code === 6
  );
}

async function findDiskIdByName(
  client: NebiusClient,
  parentId: string,
  name: string,
): Promise<string | undefined> {
  let pageToken = "";
  for (;;) {
    const res = await client.disks.list(
      ListDisksRequest.create({
        parentId,
        pageSize: Long.fromNumber(999),
        pageToken,
      }),
    );
    const match = (res.items ?? []).find(
      (disk) => (disk.metadata?.name ?? "").toLowerCase() === name.toLowerCase(),
    );
    if (match?.metadata?.id) return match.metadata.id;
    const nextToken = res.nextPageToken ?? "";
    if (!nextToken) return undefined;
    pageToken = nextToken;
  }
}

async function createDiskOrReuse(
  client: NebiusClient,
  parentId: string,
  name: string,
  spec: DiskSpec,
): Promise<string> {
  try {
    const op = await client.disks.create(
      CreateDiskRequest.create({
        metadata: ResourceMetadata.create({ parentId, name }),
        spec,
      }),
    );
    await op.wait();
    return op.resourceId();
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;
    const existingId = await findDiskIdByName(client, parentId, name);
    if (!existingId) {
      logger.warn("nebius: disk already exists but not found", {
        name,
        parentId,
        err,
      });
      throw err;
    }
    logger.info("nebius: reusing existing disk", { name, diskId: existingId });
    return existingId;
  }
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

export type NebiusProviderCreds = NebiusCreds & {
  sshPublicKey: string;
  prefix?: string;
  subnetId?: string;
};

export class NebiusProvider implements CloudProvider {
  private routingCodeFromId(id?: string): string | undefined {
    if (!id) return undefined;
    const match = id.match(/^[a-z]+-([a-z0-9]{3})/i);
    return match?.[1];
  }

  mapStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if (normalized.includes("running")) return "running";
    if (normalized.includes("stopping") || normalized.includes("deleting"))
      return "stopping";
    if (normalized.includes("starting")) return "starting";
    if (normalized.includes("stopped")) return "off";
    return undefined;
  }

  async createHost(
    spec: HostSpec,
    creds: NebiusProviderCreds,
  ): Promise<HostRuntime> {
    const client = new NebiusClient(creds);
    const parentId = creds.parentId;
    if (!parentId) {
      throw new Error("nebius parentId is required");
    }
    const name = sanitizeName(spec.name, 63);
    const subnetId =
      spec.metadata?.subnet_id ??
      spec.metadata?.nebius_subnet_id ??
      creds.subnetId;
    if (!subnetId) {
      throw new Error("nebius subnetId is required");
    }
    const serviceAccountId =
      spec.metadata?.service_account_id ??
      spec.metadata?.serviceAccountId ??
      spec.metadata?.nebius_service_account_id;
    let sourceImage =
      spec.metadata?.source_image ??
      spec.metadata?.image_id ??
      spec.metadata?.image;
    const sourceImageFamily =
      spec.metadata?.source_image_family ?? spec.metadata?.image_family;
    const routingCode =
      this.routingCodeFromId(subnetId) ??
      this.routingCodeFromId(parentId);
    const imageRouting = this.routingCodeFromId(sourceImage);
    if (sourceImage && routingCode && imageRouting && routingCode !== imageRouting) {
      logger.warn("nebius: source image routing code mismatch; using family", {
        source_image: sourceImage,
        source_image_family: sourceImageFamily,
        routing_code: routingCode,
        image_routing: imageRouting,
        parentId,
        subnetId,
      });
      sourceImage = undefined;
    }
    logger.debug("nebius: source image selection", {
      source_image: sourceImage,
      source_image_family: sourceImageFamily,
      metadata_source_image: spec.metadata?.source_image,
      metadata_image_id: spec.metadata?.image_id,
      metadata_image: spec.metadata?.image,
      metadata_source_image_family: spec.metadata?.source_image_family,
      metadata_image_family: spec.metadata?.image_family,
    });
    if (!sourceImage && !sourceImageFamily) {
      throw new Error("nebius source_image or source_image_family is required");
    }

    const bootDiskGb =
      spec.metadata?.boot_disk_gb ??
      spec.metadata?.bootDiskGb ??
      (spec.gpu ? 20 : 10);

    const diskType = diskTypeFor(spec);
    const diskIds: NebiusRuntimeMeta["diskIds"] = {};

    logger.info("nebius: creating boot disk", {
      name,
      size_gb: bootDiskGb,
      type: diskType,
    });
    const bootDiskName = `${name}-boot`;
    diskIds.boot = await createDiskOrReuse(
      client,
      parentId,
      bootDiskName,
      DiskSpec.create({
        type: diskType,
        blockSizeBytes: blockSizeBytes(),
        size: {
          $case: "sizeGibibytes",
          sizeGibibytes: Long.fromNumber(bootDiskGb),
        },
        source: sourceImage
          ? { $case: "sourceImageId", sourceImageId: sourceImage }
          : {
              $case: "sourceImageFamily",
              sourceImageFamily: SourceImageFamily.create({
                imageFamily: sourceImageFamily!,
              }),
            },
      }),
    );

    const storageMode = spec.metadata?.storage_mode;
    if (storageMode === "persistent") {
      logger.info("nebius: creating data disk", {
        name,
        size_gb: spec.disk_gb,
        type: diskType,
      });
      const dataDiskName = `${name}-data`;
      diskIds.data = await createDiskOrReuse(
        client,
        parentId,
        dataDiskName,
        DiskSpec.create({
          type: diskType,
          blockSizeBytes: blockSizeBytes(),
          size: {
            $case: "sizeGibibytes",
            sizeGibibytes: Long.fromNumber(spec.disk_gb),
          },
        }),
      );
    }

    const userData = buildUserData(spec) ?? "";
    const cloudInit = [
      "#cloud-config",
      "users:",
      "  - name: ubuntu",
      "    sudo: ALL=(ALL) NOPASSWD:ALL",
      "    shell: /bin/bash",
      "    ssh_authorized_keys:",
      `      - ${creds.sshPublicKey}`,
      userData ? "runcmd:" : "",
      userData ? `  - [ bash, -lc, ${JSON.stringify(userData)} ]` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");

    logger.info("nebius: creating instance", { name, subnetId });
    logger.debug("nebius: network interface", {
      subnetId,
      privateIp: "auto",
      publicIp: true,
    });
    const machineType = spec.metadata?.machine_type;
    if (!machineType) {
      throw new Error("nebius machine_type is required");
    }
    const platform = spec.metadata?.platform;
    if (!platform) {
      throw new Error("nebius platform is required");
    }

    const createOp = await client.instances.create(
      CreateInstanceRequest.create({
        metadata: ResourceMetadata.create({
          parentId,
          name,
        }),
        spec: InstanceSpec.create({
          ...(serviceAccountId ? { serviceAccountId } : {}),
          resources: ResourcesSpec.create({
            platform,
            size: { $case: "preset", preset: machineType },
          }),
          networkInterfaces: [
            NetworkInterfaceSpec.create({
              subnetId,
              name: "eth0",
              // Nebius requires ipAddress to be present even when auto-assigning.
              ipAddress: IPAddress.create({}),
              publicIpAddress: PublicIPAddress.create({ static: true }),
              aliases: [],
            }),
          ],
          bootDisk: AttachedDiskSpec.create({
            attachMode: AttachedDiskSpec_AttachMode.READ_WRITE,
            deviceId: "boot",
            type: {
              $case: "existingDisk",
              existingDisk: ExistingDisk.create({ id: diskIds.boot! }),
            },
          }),
          secondaryDisks: diskIds.data
            ? [
                AttachedDiskSpec.create({
                  attachMode: AttachedDiskSpec_AttachMode.READ_WRITE,
                  deviceId: "data",
                  type: {
                    $case: "existingDisk",
                    existingDisk: ExistingDisk.create({ id: diskIds.data }),
                  },
                }),
              ]
            : [],
          filesystems: [],
          cloudInitUserData: cloudInit,
          stopped: false,
          recoveryPolicy: InstanceRecoveryPolicy.RECOVER,
          hostname: name,
        }),
      }),
    );
    await createOp.wait();

    const runtime: HostRuntime = {
      provider: "nebius",
      instance_id: createOp.resourceId(),
      ssh_user: "ubuntu",
      zone: spec.region,
      metadata: {
        diskIds,
        diskTypeCode: diskType.code,
        subnetId,
      },
    };
    return runtime;
  }

  async startHost(runtime: HostRuntime, creds: NebiusProviderCreds) {
    const client = new NebiusClient(creds);
    const op = await client.instances.start(
      StartInstanceRequest.create({ id: runtime.instance_id }),
    );
    await op.wait();
  }

  async stopHost(runtime: HostRuntime, creds: NebiusProviderCreds) {
    const client = new NebiusClient(creds);
    const op = await client.instances.stop(
      StopInstanceRequest.create({ id: runtime.instance_id }),
    );
    await op.wait();
  }

  async restartHost(runtime: HostRuntime, creds: NebiusProviderCreds) {
    const client = new NebiusClient(creds);
    const stopOp = await client.instances.stop(
      StopInstanceRequest.create({ id: runtime.instance_id }),
    );
    await stopOp.wait();
    const startOp = await client.instances.start(
      StartInstanceRequest.create({ id: runtime.instance_id }),
    );
    await startOp.wait();
  }

  async deleteHost(runtime: HostRuntime, creds: NebiusProviderCreds) {
    const client = new NebiusClient(creds);
    const op = await client.instances.delete(
      DeleteInstanceRequest.create({ id: runtime.instance_id }),
    );
    await op.wait();
    const diskIds = (runtime.metadata as NebiusRuntimeMeta | undefined)?.diskIds;
    for (const diskId of [diskIds?.data, diskIds?.boot].filter(Boolean) as string[]) {
      try {
        const diskOp = await client.disks.delete(
          DeleteDiskRequest.create({ id: diskId }),
        );
        await diskOp.wait();
      } catch (err) {
        logger.warn("nebius: failed to delete disk", { diskId, err });
      }
    }
  }

  async resizeDisk(
    runtime: HostRuntime,
    newSizeGb: number,
    creds: NebiusProviderCreds,
  ) {
    const client = new NebiusClient(creds);
    const diskIds = (runtime.metadata as NebiusRuntimeMeta | undefined)?.diskIds;
    if (!diskIds?.data) {
      throw new Error("nebius: no data disk to resize");
    }
    const diskTypeCode = (runtime.metadata as NebiusRuntimeMeta | undefined)
      ?.diskTypeCode;
    const op = await client.disks.update(
      UpdateDiskRequest.create({
        metadata: ResourceMetadata.create({ id: diskIds.data }),
        spec: DiskSpec.create({
          type: diskTypeFromCode(diskTypeCode),
          blockSizeBytes: blockSizeBytes(),
          size: {
            $case: "sizeGibibytes",
            sizeGibibytes: Long.fromNumber(newSizeGb),
          },
        }),
      }),
    );
    await op.wait();
  }

  async getInstance(
    runtime: HostRuntime,
    creds: NebiusProviderCreds,
  ): Promise<RemoteInstance | undefined> {
    const client = new NebiusClient(creds);
    const instance = await client.instances.get(
      GetInstanceRequest.create({ id: runtime.instance_id }),
    );
    const status = instance.status?.state?.name;
    const publicIp = normalizeIp(
      instance.status?.networkInterfaces?.[0]?.publicIpAddress?.address,
    );
    return {
      instance_id: runtime.instance_id,
      name: instance.metadata?.name,
      status,
      public_ip: publicIp,
    };
  }

  async getStatus(
    runtime: HostRuntime,
    creds: NebiusProviderCreds,
  ): Promise<"starting" | "running" | "stopped" | "error"> {
    const instance = await this.getInstance(runtime, creds);
    const state = instance?.status ?? "";
    if (state === InstanceStatus_InstanceState.RUNNING.name) return "running";
    if (state === InstanceStatus_InstanceState.STOPPED.name) return "stopped";
    if (state === InstanceStatus_InstanceState.STARTING.name) return "starting";
    return "error";
  }

  async listInstances(
    creds: NebiusProviderCreds,
    opts?: { namePrefix?: string },
  ): Promise<RemoteInstance[]> {
    const client = new NebiusClient(creds);
    const parentId = client.parentId();
    if (!parentId) return [];
    const res = await client.instances.list(
      ListInstancesRequest.create({
        parentId,
        pageSize: Long.fromNumber(999),
        pageToken: "",
      }),
    );
    const items = res.items ?? [];
    return items
      .filter((item) => {
        const name = item.metadata?.name ?? "";
        return opts?.namePrefix ? name.startsWith(opts.namePrefix) : true;
      })
      .map((item) => ({
        instance_id: item.metadata?.id ?? "",
        name: item.metadata?.name ?? "",
        status: item.status?.state?.toString(),
        public_ip: normalizeIp(
          item.status?.networkInterfaces?.[0]?.publicIpAddress?.address,
        ),
      }))
      .filter((item) => !!item.instance_id);
  }
}
