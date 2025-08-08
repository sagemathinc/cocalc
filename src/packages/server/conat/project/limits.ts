import { k8sCpuParser, k8sMemoryParser } from "@cocalc/util/misc";
import { type Configuration } from "./types";

export function limits(config?: Configuration): string[] {
  const args: string[] = [];
  if (config == null) {
    return args;
  }

  // need '--detect_cgroupv2' or it won't work at all since it'll try to use ancient cgroups v1
  args.push("--detect_cgroupv2");

  if (config.cpu != null) {
    const cpu = k8sCpuParser(config.cpu);
    if (!isFinite(cpu) || cpu <= 0) {
      throw Error(`invalid cpu limit: '${cpu}'`);
    }
    args.push("--max_cpus", `${cpu}`);
  }

  if (config.memory != null) {
    const memory = k8sMemoryParser(config.memory);
    if (!isFinite(memory) || memory <= 0) {
      throw Error(`invalid memory limit: '${memory}'`);
    }
    args.push("--cgroup_mem_max", `${memory}`);
  }

  if (config.swap != null) {
    const swap = k8sMemoryParser(config.swap);
    if (!isFinite(swap) || swap <= 0) {
      throw Error(`invalid swap limit: '${swap}'`);
    }
    args.push("--cgroup_mem_swap_max", `${swap}`);
  }

  if (config.pids != null) {
    const pids = parseInt(`${config.pids}`);
    if (!isFinite(pids) || pids <= 0) {
      throw Error(`invalid pids limit: '${pids}'`);
    }
    args.push("--cgroup_pids_max", `${pids}`);
  }

  return args;
}
