/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CGroup, DiskUsageInfo } from "../project-info/types";

// DiskUsage for /tmp !
export function cgroup_stats(cg: CGroup, du?: DiskUsageInfo) {
  // why? /tmp is a memory disk in kucalc
  const mem_rss = cg.mem_stat.total_rss + (du?.usage ?? 0);
  const mem_tot = cg.mem_stat.hierarchical_memory_limit;
  const mem_pct = 100 * Math.min(1, mem_rss / mem_tot);
  const cpu_pct = 100 * Math.min(1, cg.cpu_usage_rate / cg.cpu_cores_limit);
  return { mem_rss, mem_tot, mem_pct, cpu_pct };
}
