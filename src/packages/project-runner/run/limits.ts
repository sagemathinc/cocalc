/**
 * Assumes cgroup v2 (Ubuntu 25.04 default) and rootless-compatible flags.
 **/
import { k8sCpuParser } from "@cocalc/util/misc";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { FAIR_CPU_MODE } from "@cocalc/util/upgrade-spec";

export function podmanLimits(config?: Configuration): string[] {
  const args: string[] = [];

  if (!config) {
    return args;
  }

  // CPU
  if (FAIR_CPU_MODE) {
    // When the CPUs are busy they’ll split fairly; when they’re not, any container
    // can burst to 100% with no cap.
    args.push("--cpu-shares=1024");
  } else if (config.cpu != null) {
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
