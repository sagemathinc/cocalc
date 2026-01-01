export type GcpRegion = {
  name: string;
  status?: string | null;
  zones: string[];
};

export type GcpZone = {
  name: string;
  status?: string | null;
  region?: string | null;
  location?: string | null;
  lowC02?: boolean | null;
};

export type GcpMachineType = {
  name?: string | null;
  guestCpus?: number | null;
  memoryMb?: number | null;
  isSharedCpu?: boolean | null;
  deprecated?: any;
};

export type GcpGpuType = {
  name?: string | null;
  maximumCardsPerInstance?: number | null;
  description?: string | null;
  deprecated?: any;
};

export type GcpCatalog = {
  regions: GcpRegion[];
  zones: GcpZone[];
  machine_types_by_zone: Record<string, GcpMachineType[]>;
  gpu_types_by_zone: Record<string, GcpGpuType[]>;
  images?: GcpImage[];
};

export type GcpImage = {
  project: string;
  name?: string | null;
  family?: string | null;
  selfLink?: string | null;
  architecture?: string | null;
  status?: string | null;
  deprecated?: any;
  diskSizeGb?: string | null;
  creationTimestamp?: string | null;
  gpuReady?: boolean;
};

export type CatalogEntry = {
  kind: string;
  scope: string;
  payload: any;
};

export type NebiusInstanceType = {
  name: string;
  platform: string;
  platform_label: string;
  vcpus?: number;
  memory_gib?: number;
  gpus?: number;
  gpu_label?: string;
};

export type NebiusImage = {
  id: string;
  name?: string | null;
  family?: string | null;
  version?: string | null;
  architecture?: string | null;
  recommended_platforms?: string[];
  region?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NebiusPriceItem = {
  service: string;
  product: string;
  region: string;
  price_usd: string;
  unit: string;
  valid_from: string;
};
