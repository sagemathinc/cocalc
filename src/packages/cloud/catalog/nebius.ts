import getLogger from "@cocalc/backend/logger";
import { NebiusClient, type NebiusCreds } from "../nebius/client";
import type { CatalogEntry, NebiusImage, NebiusInstanceType } from "./types";
import type {
  Image,
  Platform,
} from "@nebius/js-sdk/api/nebius/compute/v1/index";
import {
  ListImagesRequest,
  ListPublicRequest,
  ListPlatformsRequest,
} from "@nebius/js-sdk/api/nebius/compute/v1/index";
import { Long } from "@nebius/js-sdk/runtime/protos/index";

const logger = getLogger("cloud:catalog:nebius");

export type NebiusCatalog = {
  regions: string[];
  instance_types: NebiusInstanceType[];
  images: NebiusImage[];
};

type NebiusCatalogOpts = NebiusCreds & {
  regions?: string[];
};

async function listAllPlatforms(client: NebiusClient): Promise<Platform[]> {
  const items: Platform[] = [];
  let pageToken = "";
  while (true) {
    const response = await client.platforms.list(
      ListPlatformsRequest.create({
        parentId: client.parentId() ?? "",
        pageSize: Long.fromNumber(100),
        pageToken,
      }),
    );
    if (response.items?.length) items.push(...response.items);
    pageToken = response.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return items;
}

async function listAllImages(client: NebiusClient): Promise<Image[]> {
  const items: Image[] = [];
  let pageToken = "";
  while (true) {
    const response = await client.images.list(
      ListImagesRequest.create({
        parentId: client.parentId() ?? "",
        pageSize: Long.fromNumber(100),
        pageToken,
        filter: "",
      }),
    );
    if (response.items?.length) items.push(...response.items);
    pageToken = response.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return items;
}

async function listPublicImagesForRegion(
  client: NebiusClient,
  region: string,
): Promise<Image[]> {
  const items: Image[] = [];
  let pageToken = "";
  while (true) {
    const response = await client.images.listPublic(
      ListPublicRequest.create({
        region,
        pageSize: Long.fromNumber(100),
        pageToken,
      }),
    );
    if (response.items?.length) items.push(...response.items);
    pageToken = response.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return items;
}

export async function fetchNebiusCatalog(
  opts: NebiusCatalogOpts,
): Promise<NebiusCatalog> {
  const client = new NebiusClient(opts);
  const regions = (opts.regions ?? []).filter(Boolean);
  const [platforms, images] = await Promise.all([
    listAllPlatforms(client),
    regions.length
      ? Promise.all(
          regions.map((region) => listPublicImagesForRegion(client, region)),
        ).then((lists) => lists.flat())
      : listAllImages(client),
  ]);

  const instance_types: NebiusInstanceType[] = [];
  for (const platform of platforms) {
    const platformName = platform.metadata?.name ?? "";
    const platformLabel =
      platform.spec?.shortHumanReadableName ||
      platform.spec?.humanReadableName ||
      platformName;
    const presets = platform.spec?.presets ?? [];
    for (const preset of presets) {
      const resources = preset.resources as
        | { vcpuCount?: number; memoryGibibytes?: number; gpuCount?: number }
        | undefined;
      instance_types.push({
        name: preset.name,
        platform: platformName,
        platform_label: platformLabel,
        vcpus: resources?.vcpuCount || undefined,
        memory_gib: resources?.memoryGibibytes || undefined,
        gpus: resources?.gpuCount || undefined,
        gpu_label:
          platform.spec?.shortHumanReadableName ??
          platform.spec?.humanReadableName ??
          undefined,
      });
    }
  }

  const imageMap = new Map<string, NebiusImage>();
  for (const image of images) {
    const id = image.metadata?.id ?? "";
    if (!id) continue;
    imageMap.set(id, {
      id,
      name: image.metadata?.name ?? null,
      family: image.spec?.imageFamily ?? null,
      version: image.spec?.version ?? null,
      architecture: image.spec?.cpuArchitecture?.name ?? null,
      recommended_platforms: image.spec?.recommendedPlatforms ?? [],
    });
  }
  const normalizedImages: NebiusImage[] = Array.from(imageMap.values());

  logger.info("fetchNebiusCatalog", {
    regions: regions.length,
    platforms: platforms.length,
    images: normalizedImages.length,
  });

  return {
    regions,
    instance_types,
    images: normalizedImages,
  };
}

export function nebiusCatalogEntries(
  catalog: NebiusCatalog,
): CatalogEntry[] {
  return [
    {
      kind: "regions",
      scope: "global",
      payload: catalog.regions.map((name) => ({ name })),
    },
    {
      kind: "instance_types",
      scope: "global",
      payload: catalog.instance_types,
    },
    {
      kind: "images",
      scope: "global",
      payload: catalog.images,
    },
  ];
}
