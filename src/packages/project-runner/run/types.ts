export interface Configuration {
  // optional Docker image
  image?: string;
  // shared secret between project and hubs to enhance security (via defense in depth)
  secret?: string;
  // extra variables that get merged into the environment of the project.
  env?: { [key: string]: string };
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
