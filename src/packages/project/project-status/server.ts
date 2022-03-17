/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project status server, doing the heavy lifting of telling the client
what's going on in the project, especially if there is a problem.

Under the hood, it subscribes to the ProjectInfoServer, which updates
various statistics at a high-frequency. Therefore, this here filters
that information to a low-frequency low-volume stream of important
status updates.

Hence in particular, information like cpu, memory and disk are smoothed out and throttled.
*/

import { getLogger } from "@cocalc/project/logger";
import { how_long_ago_m, round1 } from "@cocalc/util/misc";
import { version as smcVersion } from "@cocalc/util/smc-version";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { isEqual } from "lodash";
import { get_ProjectInfoServer, ProjectInfoServer } from "../project-info";
import { ProjectInfo } from "../project-info/types";
import {
  ALERT_DISK_FREE,
  ALERT_HIGH_PCT /* ALERT_MEDIUM_PCT */,
  RAISE_ALERT_AFTER_MIN,
  STATUS_UPDATES_INTERVAL_S,
} from "./const";
import { Alert, AlertType, ComponentName, ProjectStatus } from "./types";
import { cgroup_stats } from "./utils";

// TODO: only return the "next" value, if it is significantly different from "prev"
//function threshold(prev?: number, next?: number): number | undefined {
//  return next;
//}

const winston = getLogger("ProjectStatusServer");

function quantize(val, order) {
  const q = Math.round(Math.pow(10, order));
  return Math.round(q * Math.ceil(val / q));
}

// tracks, when for the first time we saw an elevated value
// we clear it if we're below a threshold (in the clear)
interface Elevated {
  cpu: number | null; // timestamps
  memory: number | null; // timestamps
  disk: number | null; // timestamps
}

export class ProjectStatusServer extends EventEmitter {
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private readonly project_info: ProjectInfoServer;
  private info?: ProjectInfo;
  private status?: ProjectStatus;
  private last?: ProjectStatus;
  private elevated: Elevated = {
    cpu: null,
    disk: null,
    memory: null,
  };
  private elevated_cpu_procs: { [pid: string]: number } = {};
  private disk_mb?: number;
  private cpu_pct?: number;
  private cpu_tot?: number; // total time in seconds
  private mem_pct?: number;
  private mem_rss?: number;
  private mem_tot?: number;
  private components: { [name in ComponentName]?: number | undefined } = {};
  private lastEmit: number = 0; // timestamp, when status was emitted last

  constructor(testing = false) {
    super();
    this.testing = testing;
    this.dbg = (...msg) => winston.debug(...msg);
    this.project_info = get_ProjectInfoServer();
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info) => {
      //this.dbg(`got info timestamp=${info.timestamp}`);
      this.info = info;
      this.update();
      this.emitInfo();
    });
  }

  // checks if there the current state (after update()) should be emitted
  private emitInfo(): void {
    if (this.lastEmit === 0) {
      this.dbg("emitInfo[last=0]", this.status);
      this.doEmit();
      return;
    }

    // if alert changed, emit immediately
    if (!isEqual(this.last?.alerts, this.status?.alerts)) {
      this.dbg("emitInfo[alert]", this.status);
      this.doEmit();
    } else {
      // deep comparison check via lodash and we rate limit
      const recent =
        this.lastEmit + 1000 * STATUS_UPDATES_INTERVAL_S > Date.now();
      const changed = !isEqual(this.status, this.last);
      if (!recent && changed) {
        this.dbg("emitInfo[changed]", this.status);
        this.doEmit();
      }
    }
  }

  private doEmit(): void {
    this.emit("status", this.status);
    this.lastEmit = Date.now();
  }

  public setComponentAlert(name: ComponentName) {
    // we set this to the time when we first got notified about the problem
    if (this.components[name] == null) {
      this.components[name] = Date.now();
    }
  }

  public clearComponentAlert(name: ComponentName) {
    delete this.components[name];
  }

  // this derives elevated levels from the project info object
  private update_alerts() {
    if (this.info == null) return;
    const du = this.info.disk_usage.project;
    const ts = this.info.timestamp;

    const do_alert = (type: AlertType, is_bad: boolean) => {
      if (is_bad) {
        // if it isn't fine, set it once to the timestamp (and let it age)
        if (this.elevated[type] == null) {
          this.elevated[type] = ts;
        }
      } else {
        // unless it's fine again, then remove the timestamp
        this.elevated[type] = null;
      }
    };

    do_alert("disk", du.free < ALERT_DISK_FREE);
    this.disk_mb = du.usage;

    const cg = this.info.cgroup;
    const du_tmp = this.info.disk_usage.tmp;
    if (cg != null) {
      // we round/quantisize values to reduce the number of updates
      // and also send less data with each update
      const cgStats = cgroup_stats(cg, du_tmp);
      this.mem_pct = Math.round(cgStats.mem_pct);
      this.cpu_pct = Math.round(cgStats.cpu_pct);
      this.cpu_tot = Math.round(cgStats.cpu_tot);
      this.mem_tot = quantize(cgStats.mem_tot, 1);
      this.mem_rss = quantize(cgStats.mem_rss, 1);
      do_alert("memory", cgStats.mem_pct > ALERT_HIGH_PCT);
      do_alert("cpu-cgroup", cgStats.cpu_pct > ALERT_HIGH_PCT);
    }
  }

  private alert_cpu_processes(): string[] {
    const pids: string[] = [];
    if (this.info == null) return [];
    const ts = this.info.timestamp;
    const ecp = this.elevated_cpu_procs;
    // we have to check if there aren't any processes left which no longer exist
    const leftovers = new Set(Object.keys(ecp));
    // bookkeeping of elevated process PIDS
    for (const [pid, proc] of Object.entries(this.info.processes ?? {})) {
      leftovers.delete(pid);
      if (proc.cpu.pct > ALERT_HIGH_PCT) {
        if (ecp[pid] == null) {
          ecp[pid] = ts;
        }
      } else {
        delete ecp[pid];
      }
    }
    for (const pid of leftovers) {
      delete ecp[pid];
    }
    // to actually fire alert when necessary
    for (const [pid, ts] of Object.entries(ecp)) {
      if (ts != null && how_long_ago_m(ts) > RAISE_ALERT_AFTER_MIN) {
        pids.push(pid);
      }
    }
    pids.sort(); // to make this stable across iterations
    //this.dbg("alert_cpu_processes", pids, ecp);
    return pids;
  }

  // update alert levels and set alert states if they persist to be active
  private alerts(): Alert[] {
    this.update_alerts();
    const alerts: Alert[] = [];
    const alert_keys: AlertType[] = ["cpu-cgroup", "disk", "memory"];
    for (const k of alert_keys) {
      const ts = this.elevated[k];
      if (ts != null && how_long_ago_m(ts) > RAISE_ALERT_AFTER_MIN) {
        alerts.push({ type: k } as Alert);
      }
    }
    const pids: string[] = this.alert_cpu_processes();
    if (pids.length > 0) alerts.push({ type: "cpu-process", pids });

    const componentNames: ComponentName[] = [];
    for (const [k, ts] of Object.entries(this.components)) {
      if (ts == null) continue;
      // we alert without a delay
      componentNames.push(k as ComponentName);
    }
    // only send any alert if there is actually a problem!
    if (componentNames.length > 0) {
      alerts.push({ type: "component", names: componentNames });
    }
    return alerts;
  }

  private fake_data(): ProjectStatus["usage"] {
    const lastUsage = this.last?.["usage"];

    const next = (key, max) => {
      const last = lastUsage?.[key] ?? max / 2;
      const dx = max / 50;
      const val = last + dx * Math.random() - dx / 2;
      return Math.round(Math.min(max, Math.max(0, val)));
    };

    const mem_tot = 3000;
    const mem_pct = next("mem_pct", 100);
    const mem_rss = Math.round((mem_tot * mem_pct) / 100);
    const cpu_tot = round1((lastUsage?.["cpu_tot"] ?? 0) + Math.random() / 10);

    return {
      disk_mb: next("disk", 3000),
      mem_tot,
      mem_pct,
      cpu_pct: next("cpu_pct", 100),
      cpu_tot,
      mem_rss,
    };
  }

  // this function takes the "info" we have (+ more maybe?)
  // and derives various states from it.
  // It shouldn't really matter how often it is being called,
  // but still only emit new objects if it is either really necessary (new alert)
  // or after some time. This must be a low-frequency and low-volume stream of data.
  private update(): void {
    this.last = this.status;

    // alerts must come first, it updates usage status fields
    const alerts = this.alerts();

    // set this to true if you're developing (otherwise you don't get any data)
    const fake_data = false;

    // collect status fields in usage object
    const usage = fake_data
      ? this.fake_data()
      : {
          disk_mb: this.disk_mb,
          mem_pct: this.mem_pct,
          cpu_pct: this.cpu_pct,
          cpu_tot: this.cpu_tot,
          mem_rss: this.mem_rss,
          mem_tot: this.mem_tot,
        };

    this.status = { alerts, usage, version: smcVersion };
  }

  private async get_status(): Promise<ProjectStatus | undefined> {
    this.update();
    return this.status;
  }

  public stop(): void {
    this.running = false;
  }

  public async start(): Promise<void> {
    if (this.running) {
      this.dbg(
        "project-status/server: already running, cannot be started twice"
      );
    } else {
      await this._start();
    }
  }

  private async _start(): Promise<void> {
    this.dbg("start");
    if (this.running) {
      throw Error("Cannot start ProjectStatusServer twice");
    }
    this.running = true;
    await this.init();

    const status = await this.get_status();
    this.emit("status", status);

    while (this.testing) {
      await delay(5000);
      const status = await this.get_status();
      this.emit("status", status);
    }
  }
}

// singleton, we instantiate it when we need it
let _status: ProjectStatusServer | undefined = undefined;

export function get_ProjectStatusServer(): ProjectStatusServer {
  if (_status != null) return _status;
  _status = new ProjectStatusServer();
  return _status;
}

// testing: $ ts-node server.ts
if (require.main === module) {
  const pss = new ProjectStatusServer(true);
  pss.start();
  let cnt = 0;
  pss.on("status", (status) => {
    console.log(JSON.stringify(status, null, 2));
    cnt += 1;
    if (cnt >= 2) process.exit();
  });
}
