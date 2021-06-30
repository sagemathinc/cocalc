/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Monitoring of public paths in a running project.
*/

const UPDATE_INTERVAL_S: number = 20;
//const UPDATE_INTERVAL_S: number = 3; // for testing

import { lstat } from "fs";
import { execFile } from "child_process";
import { callback, delay } from "awaiting";

let monitor: MonitorPublicPaths | undefined = undefined;
export default function init() {
  if (monitor !== undefined) return;
  monitor = new MonitorPublicPaths();
}

interface Client {
  dbg: Function;
  client_id: Function;
  sync_table: Function;
  query: Function;
}

class MonitorPublicPaths {
  private client: Client;
  private table: any;

  constructor() {
    this.client = require("./client").client;
    if (this.client == null) {
      throw Error("client must have been initialized first");
    }
    if (process.env.COCALC_EPHEMERAL_STATE === "yes") {
      // nothing to do -- can't do anything with public paths if can't write to db.
      return;
    }
    this.init();
  }

  private dbg(f): Function {
    return this.client.dbg(`MonitorPublicPaths.${f}`);
  }

  private init(): void {
    const dbg = this.dbg("_init");
    dbg("initializing public_paths table");
    const pattern = {
      id: null,
      project_id: this.client.client_id(),
      path: null,
      last_edited: null,
      disabled: null,
    };
    this.table = this.client.sync_table({ public_paths: [pattern] });
    this.update_loop(); // do not await!
  }

  private async update_loop(): Promise<void> {
    const dbg = this.dbg("update_loop");
    dbg(`run update every ${UPDATE_INTERVAL_S} seconds`);
    while (this.table != null) {
      try {
        await this.update();
        dbg("successful update");
      } catch (err) {
        dbg("error doing update", err);
      }
      await delay(UPDATE_INTERVAL_S * 1000);
    }
    dbg("this.table is null, so stopping update loop");
  }

  public close(): void {
    const d = this.dbg("close");
    if (this.table == null) {
      d("already closed");
      return;
    }
    d("closing...");
    this.table.close();
    delete this.table;
  }

  private async update(): Promise<void> {
    if (this.table == null || this.table.get_state() !== "connected") {
      return;
    }
    // const d = this.dbg("update");
    const work: { id: string; path: string; last_edited: number }[] = [];
    this.table.get().forEach((info, id) => {
      if (!info.get("disabled")) {
        let last_edited = info.get("last_edited", 0);
        if (last_edited) {
          last_edited = last_edited.valueOf();
        }
        work.push({
          id,
          path: info.get("path"),
          last_edited,
        });
      }
    });
    for (const w of work) {
      await this.update_path(w);
    }
  }

  private async update_path(opts: {
    id: string;
    path: string;
    last_edited: number;
  }): Promise<void> {
    const { id, path, last_edited } = opts;
    //const d = this.dbg(`update_path('${path}')`);
    const d = function (..._args) {}; // too verbose...
    // If any file in the given path was modified after last_edited,
    // update last_edited to when the path was modified.
    let changed: boolean = false; // don't know yet
    let stats: any;
    d("lstat");
    stats = await callback(lstat, path);
    if (stats.mtime.valueOf() > last_edited) {
      d("clearly modified, since path changed");
      changed = true;
    }
    if (!changed && stats.isDirectory()) {
      // Is a directory, and directory mtime hasn't changed; still possible
      // that there is a file in some subdir has changed, so have to do
      // a full scan.
      const days = (new Date().valueOf() - last_edited) / (1000 * 60 * 60 * 24);
      // This input to find will give return code 1 if and only if it finds a FILE
      // modified since last_edited (since we know the path exists).
      const args = [
        process.env.HOME + "/" + path,
        "-type",
        "f",
        "-mtime",
        `-${days}`,
        "-exec",
        "false",
        "{}",
        "+",
      ];
      try {
        await callback(execFile, "find", args);
      } catch (err) {
        if ((err as any).code) {
          d("some files changed");
          changed = true;
        } else {
          d("nothing changed");
        }
      }
    }
    if (changed) {
      d("change -- update database table");
      const last_edited = new Date();
      this.table.set({ id, last_edited }, "shallow");
      await this.table.save(); // and also cause change to get saved to database.
    }
  }
}
