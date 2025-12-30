import { LambdaClient } from "../lambda/client";

export type LambdaInstanceType = {
  name: string;
  vcpus?: number;
  memory_gib?: number;
  gpus?: number;
  regions: string[];
};

export type LambdaImage = {
  id: string;
  name?: string | null;
  family?: string | null;
  architecture?: string | null;
  region?: string | null;
};

export type LambdaCatalog = {
  regions: string[];
  instance_types: LambdaInstanceType[];
  images: LambdaImage[];
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

export async function fetchLambdaCatalog(opts: {
  apiKey: string;
}): Promise<LambdaCatalog> {
  const client = new LambdaClient({ apiKey: opts.apiKey });
  const [typesRaw, imagesRaw] = await Promise.all([
    client.listInstanceTypes(),
    client.listImages(),
  ]);

  const instance_types: LambdaInstanceType[] = (typesRaw as InstanceTypeEntry[])
    .map((entry): LambdaInstanceType | null => {
      const name = entry.instance_type?.name;
      if (!name) return null;
      const specs = entry.instance_type?.specs ?? {};
      const regions =
        (entry.regions_with_capacity_available ?? [])
          .map((r) => r.name)
          .filter((r): r is string => !!r) ?? [];
      const normalized: LambdaInstanceType = { name, regions };
      if (specs.vcpus != null) normalized.vcpus = specs.vcpus;
      if (specs.memory_gib != null) normalized.memory_gib = specs.memory_gib;
      if (specs.gpus != null) normalized.gpus = specs.gpus;
      return normalized;
    })
    .filter((entry): entry is LambdaInstanceType => !!entry);

  const images: LambdaImage[] = (imagesRaw as ImageEntry[])
    .map((img) => ({
      id: img.id,
      name: img.name ?? null,
      family: img.family ?? null,
      architecture: img.architecture ?? null,
      region: img.region?.name ?? null,
    }))
    .filter((img) => !!img.id);

  const regions = Array.from(
    new Set(instance_types.flatMap((entry) => entry.regions)),
  ).sort();

  return { regions, instance_types, images };
}
