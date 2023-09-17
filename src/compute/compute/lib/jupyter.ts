/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote Jupyter backend session.
*/

import SyncClient from "@cocalc/sync-client";
import { meta_file } from "@cocalc/util/misc";
import { initJupyterRedux } from "@cocalc/jupyter/kernel";
import { redux } from "@cocalc/jupyter/redux/app";
import { COMPUTE_THRESH_MS } from "@cocalc/jupyter/redux/project-actions";
import debug from "debug";
import { once } from "@cocalc/util/async-utils";

const log = debug("cocalc:compute:jupyter");

export function jupyter({ client, path }) {
  return new RemoteJupyter({ client, path });
}

class RemoteJupyter {
  private client: SyncClient;
  private path: string;
  private syncdb;
  private actions;
  private store;

  constructor({ client, path }: { client: SyncClient; path: string }) {
    this.client = client;
    this.path = path;
    this.log("constructor");
    const syncdb_path = meta_file(path, "jupyter2");

    this.syncdb = client.sync_client.sync_db({
      project_id: client.project_id,
      path: syncdb_path,
      change_throttle: 50,
      patch_interval: 50,
      primary_keys: ["type", "id"],
      string_cols: ["input"],
      cursors: false,
      persistent: true,
    });

    this.initClaimSession();
    this.initRedux();
  }

  private log = (...args) => {
    log(this.path, ...args);
  };

  close = () => {
    this.log("close");
    this.syncdb.close();
    delete this.syncdb;
    // TODO
    throw Error("todo");
    this.actions;
    this.store;
  };

  private initClaimSession = async () => {
    this.log("initializing session claim protocol");
    if (this.syncdb.get_state() == "init") {
      await once(this.syncdb, "ready");
    }

    // [ ] TODO: Reset the execution
    // state of all cells, sinc running/pending cells
    // from other backend would just be stuck, which is bad.

    const claimSession = () => {
      if (this.syncdb == null) {
        return;
      }
      // TODO: instead of changing doc state, make a cursor instead
      // to accomplish this.
      this.syncdb.set({
        type: "compute",
        id: this.client.client_id(),
        time: Date.now(),
      });
      this.syncdb.commit();
    };
    const interval = setInterval(claimSession, COMPUTE_THRESH_MS / 2);
    this.syncdb.once("closed", () => {
      clearInterval(interval);
    });
    claimSession();
  };

  private initRedux = () => {
    this.log("initializing jupyter redux...");
    initJupyterRedux(this.syncdb, this.client);
    const { project_id } = this.client;
    const { path } = this;
    this.actions = redux.getEditorActions(project_id, path);
    this.store = redux.getEditorStore(project_id, path);
  };
}
