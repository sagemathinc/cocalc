export const PROVIDER_IDS = [
  "gcp",
  "hyperstack",
  "lambda",
  "local",
  "nebius",
  "self-host",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function normalizeProviderId(
  value?: string | null,
): ProviderId | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (PROVIDER_IDS.includes(normalized as ProviderId)) {
    return normalized as ProviderId;
  }
  return undefined;
}

export type HostSpec = {
  name: string;
  region: string;
  zone?: string;
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  disk_type: "ssd" | "balanced" | "standard";
  gpu?: { type: string; count: number };
  tags?: string[];
  metadata?: Record<string, any>;
};

export type HostRuntime = {
  provider: ProviderId;
  instance_id: string;
  public_ip?: string;
  ssh_user: string;
  zone?: string;
  dns_name?: string;
  metadata?: Record<string, any>;
};

export type RemoteInstance = {
  instance_id: string;
  name?: string;
  status?: string;
  zone?: string;
  public_ip?: string;
};

export interface CloudProvider {
  createHost(spec: HostSpec, creds: any): Promise<HostRuntime>;
  startHost(runtime: HostRuntime, creds: any): Promise<void>;
  stopHost(runtime: HostRuntime, creds: any): Promise<void>;
  deleteHost(runtime: HostRuntime, creds: any): Promise<void>;
  resizeDisk(runtime: HostRuntime, newSizeGb: number, creds: any): Promise<void>;
  getStatus(
    runtime: HostRuntime,
    creds: any,
  ): Promise<"starting" | "running" | "stopped" | "error">;
  mapStatus?(status?: string): string | undefined;
  getInstance?(
    runtime: HostRuntime,
    creds: any,
  ): Promise<RemoteInstance | undefined>;
  listInstances?(
    creds: any,
    opts?: { namePrefix?: string },
  ): Promise<RemoteInstance[]>;
}
