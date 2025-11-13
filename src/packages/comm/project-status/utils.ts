/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type {
  CGroup,
  DiskUsageInfo,
} from "@cocalc/util/types/project-info/types";

/**
 * Calculate resource usage statistics from cgroup data.
 *
 * This function processes cgroup resource information and calculates usage percentages
 * for both memory and CPU. It works with both cgroup v1 and v2 data structures,
 * handling the unified CGroup interface that abstracts the differences between versions.
 */
export function cgroup_stats(cg: CGroup, du?: DiskUsageInfo) {
  // DiskUsage for /tmp – add to memory usage since it's already been
  // calculated appropriately by the backend based on whether /tmp is tmpfs
  const mem_rss = cg.mem_stat.total_rss + (du?.usage ?? 0);
  const mem_tot = cg.mem_stat.hierarchical_memory_limit;

  // Handle unlimited (-1) and zero memory limits to avoid division by zero
  const mem_pct = mem_tot <= 0 ? 0 : 100 * Math.min(1, mem_rss / mem_tot);

  // Handle unlimited (-1) and zero CPU limits to avoid division by zero
  const cpu_pct =
    cg.cpu_cores_limit <= 0
      ? 0
      : 100 * Math.min(1, cg.cpu_usage_rate / cg.cpu_cores_limit);

  const cpu_tot = cg.cpu_usage; // seconds
  return { mem_rss, mem_tot, mem_pct, cpu_pct, cpu_tot };
}
