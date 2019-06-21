/*
Monitoring of public paths in a running project.
*/

const UPDATE_INTERVAL_S: number = 20;
//const UPDATE_INTERVAL_S: number = 3; // for testing

import { lstat } from "fs";
import { execFile } from "child_process";

import * as async from "async";

export function monitor(client) {
  return new MonitorPublicPaths(client);
}

interface Client {
  dbg: Function;
  client_id: Function;
  sync_table2: Function;
  query: Function;
}

class MonitorPublicPaths {
  private client: Client;
  private interval: NodeJS.Timer;
  private table: any;

  constructor(client: Client) {
    this.dbg = this.dbg.bind(this);
    this.update = this.update.bind(this);
    this.update_path = this.update_path.bind(this);
    this.client = client;
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
      disabled: null
    };
    this.table = this.client.sync_table2({ public_paths: [pattern] });

    dbg(`initializing find updater to run every ${UPDATE_INTERVAL_S} seconds`);
    const dbg1 = this.dbg("do_update");
    const do_update = (): void => {
      dbg1("doing update...");
      this.update(err => {
        dbg1("finished an update", err);
      });
    };
    this.interval = setInterval(do_update, UPDATE_INTERVAL_S * 1000);
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
    clearInterval(this.interval);
    delete this.interval;
  }

  update(cb: Function): void {
    if (this.table == null || this.table.get_state() !== "connected") {
      cb();
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
          last_edited
        });
      }
    });
    async.mapLimit(work, 1, this.update_path, cb);
  }

  private update_path(
    opts: { id: string; path: string; last_edited: number },
    cb: Function
  ): void {
    let { id, path, last_edited } = opts;
    // const d = this.dbg(`update_path('${path}')`);
    const d = function(..._args) {}; // too verbose...
    // If any file in the given path was modified after last_edited,
    // update last_edited to when the path was modified.
    let changed: boolean = false;
    let stats: any;
    async.series(
      [
        cb => {
          d("lstat");
          lstat(path, (err, the_stats) => {
            if (err) {
              d("error (no such path?)", err);
              cb(err);
              return;
            }
            stats = the_stats;
            if (stats.mtime.valueOf() > last_edited) {
              d("clearly modified, since path changed");
              changed = true;
            }
            cb();
          });
        },
        cb => {
          if (changed) {
            // already determined above
            cb();
            return;
          }
          if (!stats.isDirectory()) {
            // is file, but mtime older, so done.
            cb();
            return;
          }
          // Is a directory, and directory mtime hasn't changed; still possible
          // a file in some subdir has changed, so have to do a full scan.
          const days =
            (new Date().valueOf() - last_edited) / (1000 * 60 * 60 * 24);
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
            "+"
          ];
          execFile("find", args, err => {
            if (err != null ? (err as any).code : undefined) {
              d("some files changed");
              changed = true;
            } else {
              d("nothing changed");
            }
            cb();
          });
        },
        cb => {
          if (!changed) {
            cb();
          } else {
            d("change -- update database table");
            const last_edited = new Date();
            this.table.set({ id, last_edited }, "shallow");
            this.table.save(); // and also cause change to get saved to database.
            // This can be more robust (if actually connected).
            this.client.query({ query: { id, last_edited }, cb });
          }
        }
      ],
      _err => {
        // ignore _err
        if (cb != null) cb();
      }
    );
  }
}
