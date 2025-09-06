export interface Configuration {
  admin?: boolean;
  // cpu limit: sames as k8s format
  cpu?: number | string;
  // memory limit: sames as k8s format
  memory?: number | string;
  // swap limit
  swap?: number | string;
  // pid limit
  pids?: number | string;
  // disk size
  disk?: number | string;
}
