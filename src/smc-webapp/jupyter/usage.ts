/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COLORS } from "smc-util/theme";

import {
  ALERT_HIGH_PCT,
  ALERT_MEDIUM_PCT,
  ALERT_LOW_PCT,
} from "../../smc-project/project-status/const";

import { Usage, AlertLevel } from "./types";

export const ALERT_COLS: { [key in AlertLevel]: string } = {
  none: COLORS.BS_GREEN,
  low: COLORS.ANTD_YELL_M,
  mid: COLORS.ANTD_ORANGE,
  high: COLORS.ANTD_RED_WARN,
} as const;

export function compute_usage(opts): Usage {
  const {
    kernel_usage,
    backend_state,
    cpu_runtime,
    expected_cell_runtime,
  } = opts;
  // not using resources, return sane "zero" defaults
  if (
    kernel_usage == null ||
    backend_state == null ||
    !["running", "starting"].includes(backend_state)
  ) {
    return {
      mem: 0,
      mem_limit: 1000, // 1 GB
      cpu: 0, // 1 core
      cpu_runtime: 0,
      cpu_limit: 1,
      mem_alert: "none",
      cpu_alert: "none",
      mem_pct: 0,
      cpu_pct: 0,
      time_alert: "none",
    };
  }

  // NOTE: cpu/mem usage of this and all subprocesses are just added up
  // in the future, we could do something more sophisticated, the information is available

  // cpu numbers
  const cpu_self = kernel_usage.get("cpu") ?? 0;
  const cpu_chld = kernel_usage.get("cpu_chld") ?? 0;
  const cpu = cpu_self + cpu_chld;
  const cpu_limit: number = kernel_usage?.get("cpu_limit") ?? 1;

  // memory numbers
  // the main idea here is to show how much more memory the kernel could use
  // the basis is the remaining free memory + it's memory usage
  const mem_self = kernel_usage.get("mem") ?? 0;
  const mem_chld = kernel_usage.get("mem_chld") ?? 0;
  const mem = mem_self + mem_chld;
  const mem_free = kernel_usage?.get("mem_free");
  const mem_limit: number = mem_free != null ? mem_free + mem : 1000;

  const cpu_alert =
    cpu > ALERT_HIGH_PCT * cpu_limit
      ? "high"
      : cpu > ALERT_MEDIUM_PCT * cpu_limit
      ? "mid"
      : cpu > 1 // indicate any usage at all, basically
      ? "low"
      : "none";
  const mem_alert =
    mem > (ALERT_HIGH_PCT / 100) * mem_limit
      ? "high"
      : mem > (ALERT_MEDIUM_PCT / 100) * mem_limit
      ? "mid"
      : mem > (ALERT_LOW_PCT / 100) * mem_limit
      ? "low"
      : "none";
  const time_alert =
    cpu_runtime > 8 * expected_cell_runtime
      ? "high"
      : cpu_runtime > 4 * expected_cell_runtime
      ? "mid"
      : cpu_runtime > 2 * expected_cell_runtime
      ? "low"
      : "none";
  return {
    mem,
    mem_limit,
    cpu_runtime,
    cpu,
    cpu_limit,
    cpu_alert,
    mem_alert,
    time_alert,
    mem_pct: (100 * mem) / mem_limit,
    cpu_pct: (100 * cpu) / cpu_limit,
  };
}
