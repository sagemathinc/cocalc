/**
 * Assumes cgroup v2 (Ubuntu 25.04 default) and rootless-compatible flags.
 **/
import { k8sCpuParser } from "@cocalc/util/misc";
import { type Configuration } from "./types";

export function podmanLimits(config?: Configuration): string[] {
  const args: string[] = [];

  if (!config) {
    return args;
  }

  // CPU
  if (config.cpu != null) {
    const cpu = k8sCpuParser(config.cpu); // accepts "500m", "2", etc.
    if (!isFinite(cpu) || cpu <= 0) {
      throw Error(`invalid cpu limit: '${cpu}'`);
    }
    args.push(`--cpus=${cpu}`);
  }

  // Memory & swap
  if (config.memory != null) {
    args.push(`--memory=${config.memory}`);
  }

  if (config.swap != null) {
    args.push(`--memory-swap=${config.swap}`);
  }

  // PIDs
  if (config.pids != null) {
    const pids = parseInt(`${config.pids}`, 10);
    if (!isFinite(pids) || pids <= 0) {
      throw Error(`invalid pids limit: '${pids}'`);
    }

    // Total processes in the container:
    args.push(`--pids-limit=${pids}`);
  }

  return args;
}
