/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote Jupyter backend session.
*/

import SyncClient from "@cocalc/sync-client";
import { meta_file } from "@cocalc/util/misc";
import { initJupyterRedux } from "@cocalc/jupyter/kernel";
import { redux } from "@cocalc/jupyter/redux/app";
import { COMPUTE_THRESH_MS } from "@cocalc/jupyter/redux/actions";
import debug from "debug";
import { once } from "@cocalc/util/async-utils";

const log = debug("cocalc:compute:jupyter");

export function jupyter({ client, path }) {
  return new RemoteJupyter({ client, path });
}

class RemoteJupyter {
  private client: SyncClient;
  private path: string;
  private sync_db;
  private actions;
  private store;

  constructor({ client, path }: { client: SyncClient; path: string }) {
    this.client = client;
    this.path = path;
    this.log("constructor");
    const syncdb_path = meta_file(path, "jupyter2");

    this.sync_db = client.sync_client.sync_db({
      project_id: client.project_id,
      path: syncdb_path,
      change_throttle: 50,
      patch_interval: 50,
      primary_keys: ["type", "id"],
      string_cols: ["input"],
      cursors: true,
      persistent: true,
    });

    this.initClaimSession();
    this.initRedux();
  }

  private log = (...args) => {
    log(this.path, ...args);
  };

  close = async () => {
    if (this.sync_db == null) {
      return;
    }
    this.log("close");
    const { sync_db } = this;
    delete this.sync_db;
    sync_db.set_cursor_locs([]);
    sync_db.close();
    // TODO
    this.actions;
    this.store;
  };

  private initClaimSession = async () => {
    this.log("initializing session claim protocol");
    if (this.sync_db.get_state() == "init") {
      await once(this.sync_db, "ready");
    }

    // [ ] TODO: Reset the execution
    // state of all cells, sinc running/pending cells
    // from other backend would just be stuck, which is bad.

    const claimSession = () => {
      if (this.sync_db == null) {
        return;
      }
      console.log("Setting compute server cursor");
      this.sync_db.set_cursor_locs([
        {
          type: "compute",
          time: Date.now(),
        },
      ]);
    };
    const interval = setInterval(claimSession, COMPUTE_THRESH_MS / 2);
    this.sync_db.once("closed", () => {
      clearInterval(interval);
    });
    claimSession();
  };

  private initRedux = () => {
    this.log("initializing jupyter redux...");
    initJupyterRedux(this.sync_db, this.client);
    const { project_id } = this.client;
    const { path } = this;
    this.actions = redux.getEditorActions(project_id, path);
    this.store = redux.getEditorStore(project_id, path);
  };
}
