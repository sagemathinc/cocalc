export type GcpRegion = {
  name: string;
  status?: string | null;
  zones: string[];
};

export type GcpZone = {
  name: string;
  status?: string | null;
  region?: string | null;
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
};
