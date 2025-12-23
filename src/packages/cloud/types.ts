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
  provider: "gcp" | "hyperstack" | "local";
  instance_id: string;
  public_ip?: string;
  ssh_user: string;
  zone?: string;
  dns_name?: string;
  metadata?: Record<string, any>;
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
}
