/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project status server, doing the heavy lifting of telling the client
if there is something funny going on in the project.

Under the hood, it subscribes to the ProjectInfoServer, which updates
various statistics at a high-frequency. Therefore, this here filters
that information to a low-frequency low-volume stream of important
status updates.
*/

// only for testing, see bottom
if (require.main === module) {
  require("coffee-register");
}

//import { reuseInFlight } from "async-await-utils/hof";
import { EventEmitter } from "events";
import { delay } from "awaiting";
import { minutes_ago } from "../../smc-util/misc";
import { ALERT_HIGH_PCT /* ALERT_MEDIUM_PCT */ } from "./const";
import { ProjectStatus, Alert } from "./types";
import { ProjectInfoServer, get_ProjectInfoServer } from "../project-info";
import { ProjectInfo } from "../project-info/types";
import { version } from "../../smc-util/smc-version";
import { cgroup_stats } from "./utils";

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
  private elevated: Elevated = {
    cpu: null,
    disk: null,
    memory: null,
  };

  constructor(L, testing = false) {
    super();
    //this.update = reuseInFlight(this.update.bind(this));
    this.testing = testing;
    this.dbg = (...msg) => L("ProjectStatusServer", ...msg);
    this.project_info = get_ProjectInfoServer(L);
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info) => {
      //this.dbg(`got info timestamp=${info.timestamp}`);
      this.info = info;
      this.update();
    });
  }

  private update_alerts() {
    if (this.info == null) return;
    const du = this.info.disk_usage.project;
    const ts = this.info.timestamp;

    const do_alert = (type: "disk" | "memory" | "cpu", is_bad: boolean) => {
      if (is_bad && this.elevated[type] == null) {
        this.elevated[type] = ts;
      } else {
        this.elevated[type] = null;
      }
    };

    const disk_pct = 100 * (du.usage / du.available);
    do_alert("disk", disk_pct > ALERT_HIGH_PCT);

    const cg = this.info.cgroup;
    const du_tmp = this.info.disk_usage.tmp;
    if (cg != null) {
      const { mem_pct, cpu_pct } = cgroup_stats(cg, du_tmp);
      do_alert("memory", mem_pct > ALERT_HIGH_PCT);
      do_alert("cpu", cpu_pct > ALERT_HIGH_PCT);
    }
  }

  private alerts(): Alert[] {
    this.update_alerts();
    const alerts: Alert[] = [];
    for (const k of ["cpu", "disk", "memory"]) {
      const ts = this.elevated[k];
      if (ts != null && minutes_ago(ts) > 1) {
        alerts.push({ type: k } as Alert);
      }
    }
    return alerts;
  }

  // this function takes the "info" we have (+ more maybe?)
  // and derives various states from it. It is wrapped in reuseInFlight
  // in case there are too many calls and it shouldn't really matter how often
  // it is being called
  private update(): void {
    this.status = {
      alerts: this.alerts(),
      version: version,
      timestamp: new Date().getTime(),
    };
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
      this.dbg("alerady running, cannot be started twice");
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

export function get_ProjectStatusServer(L: Function): ProjectStatusServer {
  if (_status != null) return _status;
  _status = new ProjectStatusServer(L);
  return _status;
}

// testing: $ ts-node server.ts
if (require.main === module) {
  const pss = new ProjectStatusServer(console.log, true);
  pss.start();
  let cnt = 0;
  pss.on("status", (status) => {
    console.log(JSON.stringify(status, null, 2));
    cnt += 1;
    if (cnt >= 2) process.exit();
  });
}
