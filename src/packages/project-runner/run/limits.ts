import { k8sCpuParser, k8sMemoryParser } from "@cocalc/util/misc";
import { type Configuration } from "./types";

// [ ] TODO: redo these with docker/podman args

// I have not figured out how to use cgroups yet, or which cgroups to use.
// See discussion here: https://github.com/google/nsjail/issues/196
// TODO: cgroups are of course much better.
const USE_CGROUPS = false;

export function limits(config?: Configuration): string[] {
  const args: string[] = [];
  if (config == null) {
    args.push("--disable_rlimits");
    return args;
  }
  // rlimits we don't change below
  args.push("--rlimit_cpu", "max");
  args.push("--rlimit_fsize", "max");
  args.push("--rlimit_nofile", "max");

  // need '--detect_cgroupv2' or it won't work at all since it'll try to use ancient cgroups v1
  if (USE_CGROUPS) {
    args.push("--detect_cgroupv2");
  }

  if (config.cpu != null) {
    const cpu = k8sCpuParser(config.cpu);
    if (!isFinite(cpu) || cpu <= 0) {
      throw Error(`invalid cpu limit: '${cpu}'`);
    }
    if (USE_CGROUPS) {
      // "Number of milliseconds of CPU time per second"
      args.push("--cgroup_cpu_ms_per_sec", `${Math.ceil(cpu * 1000)}`);
    } else {
      // --max_cpus only takes an INTEGER as input, hence ceil
      args.push("--max_cpus", `${Math.ceil(cpu)}`);
    }
  }

  if (config.memory != null) {
    const memory = k8sMemoryParser(config.memory);
    if (!isFinite(memory) || memory <= 0) {
      throw Error(`invalid memory limit: '${memory}'`);
    }
    if (USE_CGROUPS) {
      // cgroups is the only reliable way to cap memory...
      args.push("--cgroup_mem_max", `${memory}`);
    }
  }

  if (config.swap != null) {
    if (USE_CGROUPS) {
      const swap = k8sMemoryParser(config.swap);
      if (!isFinite(swap) || swap <= 0) {
        throw Error(`invalid swap limit: '${swap}'`);
      }
      args.push("--cgroup_mem_swap_max", `${swap}`);
    }
  }

  if (config.pids != null) {
    const pids = parseInt(`${config.pids}`);
    if (!isFinite(pids) || pids <= 0) {
      throw Error(`invalid pids limit: '${pids}'`);
    }
    if (USE_CGROUPS) {
      args.push("--cgroup_pids_max", `${pids}`);
    } else {
      // nproc is maybe a bit tighter than limiting pids, due to threads
      args.push("--rlimit_nproc", `${pids}`);
    }
  }

  return args;
}
