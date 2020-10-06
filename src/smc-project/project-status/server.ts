/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project status server, doing the heavy lifting of telling the client
if there is something funny going on in the project.
*/

// only for testing, see bottom
if (require.main === module) {
  require("coffee-register");
}

import { EventEmitter } from "events";
import { delay } from "awaiting";
import { ProjectStatus } from "./types";
import { ProjectInfoServer, get_ProjectInfoServer } from "../project-info";
import { ProjectInfo } from "../project-info/types";

export class ProjectStatusServer extends EventEmitter {
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private delay_s: number;
  private readonly project_info: ProjectInfoServer;
  private info?: ProjectInfo;

  constructor(L, testing = false) {
    super();
    this.delay_s = testing ? 5 : 60;
    this.testing = testing;
    this.dbg = (...msg) => L("ProjectStatusServer", ...msg);
    this.project_info = get_ProjectInfoServer(L);
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info) => {
      this.dbg(`got info timestamp=${info.timestamp}`);
      this.info = info;
    });
  }

  private async get_status(): Promise<ProjectStatus> {
    // TODO this is just fake data
    this.dbg(`have info → ${this.info != null}`);
    return { version: new Date().getTime(), alerts: [] };
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
    while (true) {
      const status = await this.get_status();
      this.emit("status", status);
      if (this.running) {
        await delay(1000 * this.delay_s);
      } else {
        this.dbg("start: no longer running → stopping loop");
        return;
      }
      // abort in test mode, just one more and show it
      if (this.testing) {
        const status = await this.get_status();
        this.dbg(JSON.stringify(status, null, 2));
        return;
      }
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
  pss.start().then(() => process.exit());
}
