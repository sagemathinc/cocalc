/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * This little utility tames process of this project to be kind to other users.
 * It's inspired by and – http://and.sourceforge.net/
 */

import * as debug from "debug";
const L = debug("project:autorenice");
import { reverse, sortBy } from "lodash";
import { setPriority } from "os";
import { delay } from "awaiting";
import { ProjectInfoServer, get_ProjectInfoServer } from "./project-info";
import { ProjectInfo, Processes, Process } from "./project-info/types";
import { is_free_project, DEFAULT_FREE_PROCS_NICENESS } from "./project-setup";

const INTERVAL_S = 10;

// renice configuration -- the first time values must be decreasing
const RENICE = reverse(
  sortBy(
    [
      { time_s: 10 * 60, niceness: 19 },
      { time_s: 5 * 60, niceness: 10 },
      { time_s: 60, niceness: 4 },
    ],
    "time_s"
  )
);

interface Opts {
  verbose?: boolean;
  config?: string; // TODO: make it possible to set via env var COCALC_PROJECT_AUTORENICE (also there are only harcoded values).
}

class ProcessRenicer {
  private readonly verbose: boolean;
  private readonly free_project: boolean;
  private readonly project_info: ProjectInfoServer;
  private readonly config: string;
  private timestamp?: number;
  private processes?: Processes;

  constructor(opts?: Opts) {
    const { verbose = false, config = "1" } = opts ?? {};
    this.free_project = is_free_project();
    this.verbose = verbose;
    this.config = config;
    L("config", this.config);
    if (config == "0") return;
    this.project_info = get_ProjectInfoServer();
    this.init();
    this.start();
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info: ProjectInfo) => {
      this.update(info);
    });
  }

  // got new data from the ProjectInfoServer
  private update(info: ProjectInfo) {
    if (info != null) {
      this.processes = info.processes;
      this.timestamp = info.timestamp;
    }
  }

  // this is the main "infinite loop"
  private async start(): Promise<void> {
    if (this.verbose) L("starting main loop");
    while (true) {
      await delay(INTERVAL_S * 1000);

      // no data yet
      if (this.processes == null || this.timestamp == null) continue;

      // ignore outdated data
      if (this.timestamp < Date.now() - 60 * 1000) continue;

      // check processes
      for (const proc of Object.values(this.processes)) {
        // ignore the init process
        if (proc.pid == 1) continue;

        // we also skip the project process
        if (proc.cocalc?.type == "project") continue;

        this.adjust_proc(proc);
      }
    }
  }

  private adjust_proc(proc: Process) {
    // special case: free project processes have a low default priority
    const old_nice = proc.stat.nice;
    const new_nice = this.nice(proc.stat);
    if (old_nice < new_nice) {
      const msg = `${proc.pid} from ${old_nice} to ${new_nice}`;
      try {
        L(`setPriority ${msg}`);
        setPriority(proc.pid, new_nice);
      } catch (err) {
        L(`Error setPriority ${msg}`, err);
      }
    }
  }

  private nice(stat) {
    // for free projects we do not bother with actual usage – just down prioritize all of them
    if (this.free_project) {
      return DEFAULT_FREE_PROCS_NICENESS;
    }

    const { utime, stime, cutime, cstime } = stat;
    const self = utime + stime;
    const child = cutime + cstime;

    for (const { time_s, niceness } of RENICE) {
      if (self > time_s || child > time_s) {
        return niceness;
      }
    }
    return 0;
  }
}

let singleton: ProcessRenicer | undefined = undefined;

export function activate(opts?: Opts) {
  if (singleton != null) {
    L("blocking attempt to run ProcessRenicer twice");
    return;
  }
  singleton = new ProcessRenicer(opts);
  return singleton;
}

// testing: $ ts-node autorenice.ts
async function test() {
  const pr = activate({ verbose: true });
  L("activated ProcessRenicer in test mode", pr);
  await delay(3 * 1000);
  L("test done");
}

if (require.main === module) {
  test();
}
