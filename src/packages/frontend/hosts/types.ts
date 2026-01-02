export type HostProvider = "gcp" | "hyperstack" | "lambda" | "nebius" | "none";

export type HostListViewMode = "grid" | "list";

export type HostSortField = "name" | "provider" | "region" | "size" | "status";

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
  source_image?: string;
  rationale?: string;
  est_cost_per_hour?: number;
};
