export type HostProvider =
  | "gcp"
  | "hyperstack"
  | "lambda"
  | "nebius"
  | "self-host"
  | "none";

export type HostListViewMode = "grid" | "list";

export type HostSortField =
  | "name"
  | "provider"
  | "region"
  | "size"
  | "status"
  | "changed";

export type HostSortDirection = "asc" | "desc";

export type HostRecommendation = {
  title?: string;
  provider: HostProvider;
  region?: string;
  zone?: string;
  machine_type?: string;
  flavor?: string;
  gpu_type?: string;
  gpu_count?: number;
  disk_gb?: number;
  rationale?: string;
  est_cost_per_hour?: number;
};
