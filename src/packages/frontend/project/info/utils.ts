/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { basename } from "path";
import { CSS } from "@cocalc/frontend/app-framework";
import { Process, Processes, State } from "@cocalc/util/types/project-info/types";
import {
  ALERT_DISK_FREE,
  ALERT_HIGH_PCT,
  ALERT_MEDIUM_PCT,
} from "@cocalc/comm/project-status/const";
import { separate_file_extension, trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DUState, PTStats, ProcessRow } from "./types";
const { ANTD_RED, ANTD_ORANGE, ANTD_GREEN } = COLORS;

export const SSH_KEYS_DOC =
  "https://doc.cocalc.com/project-settings.html#ssh-keys";
export const DETAILS_BTN_TEXT = "Details";

// this converts a path a maybe shortened basename of the file
export function filename(path) {
  const fn = basename(path);
  const name = separate_file_extension(fn).name;
  return trunc(name, 12);
}

// this is always normalized for 0 to 100
export function warning_color_pct(val) {
  if (val > ALERT_HIGH_PCT) return ANTD_RED;
  if (val > ALERT_MEDIUM_PCT) return ANTD_ORANGE;
  return ANTD_GREEN;
}

// pct: disk usage in 0 to 100
// free: remaining MiBs left
export function warning_color_disk(disk_usage: DUState) {
  const pct = disk_usage.pct;
  const free = disk_usage.total - disk_usage.usage;
  if (free < ALERT_DISK_FREE) return ANTD_RED;
  if (pct > ALERT_MEDIUM_PCT) return ANTD_ORANGE;
  return ANTD_GREEN;
}

const GRID_RED: CSS = {
  backgroundColor: ANTD_RED,
  color: "white",
  fontWeight: "bold",
};

const GRID_ORANGE: CSS = {
  backgroundColor: ANTD_ORANGE,
};

function grid_color(val, max) {
  const col = warning_color_pct(100 * (val / max));
  switch (col) {
    case ANTD_RED:
      return GRID_RED;
    case ANTD_ORANGE:
      return GRID_ORANGE;
  }
  return null;
}

// returns a CSS colored style to emphasize high values warnings
export function grid_warning(val: number, max: number): CSS {
  const col = grid_color(val, max);
  return col != null ? col : {};
}

// filter for processes in process_tree
function keep_proc(proc): boolean {
  if (proc.pid === 1) {
    // this is the container's tini process
    return false;
  }
  const cmd2 = proc.cmdline[2];
  if (
    proc.ppid === 1 &&
    cmd2 != null &&
    cmd2.indexOf("/cocalc/init/init.sh") >= 0 &&
    cmd2.indexOf("$COCALC_PROJECT_ID") >= 0
  ) {
    return false;
  }
  return true;
}

function args(proc: Process) {
  const { cmdline, exe } = proc;
  // there are situations, where the first argument is actually very long and contains a lot of arguments
  if (cmdline.length == 1 && cmdline[0].split(" ").length > 2) {
    // this that case a common pattern seems to be "process-name: custom text"
    const cmd: string = cmdline[0];
    const prefix = `${basename(exe)}:`;
    if (cmd.startsWith(prefix)) {
      return cmd.slice(prefix.length + 1);
    } else {
      return cmd;
    }
  } else {
    // otherwise, we don't need it, confuses with the running exe
    return cmdline.slice(1).join(" ");
  }
}

// Harald: convert the flat raw data into nested (forest) process rows for the table
// I bet there are better algos, but our usual case is less than 10 procs with little nesting
// we intentionally ignore PID 1 (tini) and the main shell script (pointless)

// William: I personally find this tree structure as the default and only option
// annoying.  When I look at the processes it is to identify the worst offender via sorting
// and watch or kill it.  This obfuscates that goal.

export function process_tree(
  procs: Processes,
  parentid: number,
  pchildren: string[],
  stats: PTStats
): ProcessRow[] | undefined {
  const data: ProcessRow[] = [];
  Object.values(procs).forEach((proc) => {
    if (proc.ppid == parentid) {
      const key = `${proc.pid}`;
      const children = process_tree(procs, proc.pid, pchildren, stats);
      if (children != null) pchildren.push(key);
      const p: ProcessRow = {
        key,
        pid: proc.pid,
        ppid: proc.ppid,
        name: basename(proc.exe),
        args: args(proc),
        state: proc.stat.state as State,
        mem: proc.stat.mem.rss,
        cpu_tot: proc.cpu.secs,
        cpu_pct: proc.cpu.pct,
        cocalc: proc.cocalc,
        children,
      };
      if (proc.cocalc?.type === "project") {
        // for a project, we list processes separately – one root for all is unnecessary to show
        p.children = undefined;
        data.push(p);
        if (children != null) data.push(...children);
      } else {
        // we want to hide some processes as well
        if (keep_proc(proc)) {
          data.push(p);
          stats.nprocs += 1;
          stats.threads += proc.stat.num_threads;
          stats.sum_cpu_time += proc.cpu.secs;
          stats.sum_cpu_pct += proc.cpu.pct;
          stats.sum_memory += proc.stat.mem.rss;
        } else {
          if (children != null) data.push(...children);
        }
      }
    }
  });
  return data.length > 0 ? data : undefined;
}

/**
 * A linear list of processes, where each process is a row in the table.
 */
export function linearList(procs: Processes): ProcessRow[] | undefined {
  const data: ProcessRow[] = [];
  Object.values(procs).forEach((proc) => {
    const key = `${proc.pid}`;
    const p: ProcessRow = {
      key,
      pid: proc.pid,
      ppid: proc.ppid,
      name: basename(proc.exe),
      args: args(proc),
      state: proc.stat.state as State,
      mem: proc.stat.mem.rss,
      cpu_tot: proc.cpu.secs,
      cpu_pct: proc.cpu.pct,
      cocalc: proc.cocalc,
      children: undefined,
    };
    if (keep_proc(proc)) {
      data.push(p);
    }
  });
  return data.length > 0 ? data : undefined;
}

function sum_children_val(proc, index): number {
  if (proc.children == null) return 0;
  return proc.children
    .map((p) => p[index] + sum_children_val(p, index))
    .reduce((a, b) => a + b, 0);
}

// we pre-compute the sums of all children (instead of doing this during each render)
export function sum_children(ptree: ProcessRow[]) {
  ptree.forEach((proc) => {
    if (proc.children == null) {
      return { mem: 0, cpu_tot: 0, cpu_pct: 0 };
    } else {
      proc.chldsum = {
        mem: sum_children_val(proc, "mem"),
        cpu_tot: sum_children_val(proc, "cpu_tot"),
        cpu_pct: sum_children_val(proc, "cpu_pct"),
      };
      sum_children(proc.children);
    }
  });
}
