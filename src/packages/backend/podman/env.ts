export function podmanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const runtimeDir = env.COCALC_PODMAN_RUNTIME_DIR || env.XDG_RUNTIME_DIR;
  if (runtimeDir) {
    env.XDG_RUNTIME_DIR = runtimeDir;
  }
  if (!env.CONTAINERS_CGROUP_MANAGER) {
    env.CONTAINERS_CGROUP_MANAGER = "cgroupfs";
  }
  return env;
}
