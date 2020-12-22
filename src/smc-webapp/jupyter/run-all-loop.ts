/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// using require because this file is used in smc-project and import is messe
const { close } = require("smc-util/misc");
import { delay } from "awaiting";
import { JupyterActions } from "./project-actions";

export class RunAllLoop {
  private actions: JupyterActions;
  public interval_s: number;
  private closed: boolean = false;
  private dbg: Function;

  constructor(actions, interval_s) {
    this.actions = actions;
    this.interval_s = interval_s;
    this.dbg = actions.dbg("RunAllLoop");
    this.dbg(`interval_s=${interval_s}`);
    this.loop();
  }

  public set_interval(interval_s: number): void {
    if (this.closed) {
      throw Error("should not call set_interval if RunAllLoop is closed");
    }
    if (this.interval_s == interval_s) return;
    this.dbg(`.set_interval: interval_s=${interval_s}`);
    this.interval_s = interval_s;
  }

  private async loop(): Promise<void> {
    this.dbg("starting loop...");
    while (true) {
      if (this.closed) break;
      try {
        this.dbg("loop: restart");
        await this.actions.restart();
      } catch (err) {
        this.dbg(`restart failed (will try run-all anyways) - ${err}`);
      }
      if (this.closed) break;
      try {
        this.dbg("loop: run_all_cells");
        await this.actions.run_all_cells(true);
      } catch (err) {
        this.dbg(`run_all_cells failed - ${err}`);
      }
      if (this.closed) break;
      this.dbg(`loop: waiting ${this.interval_s} seconds`);
      await delay(this.interval_s * 1000);
    }
    this.dbg("terminating loop...");
  }

  public close() {
    this.dbg("close");
    close(this);
    this.closed = true;
  }
}
