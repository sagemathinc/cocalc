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
import { COMPUTER_SERVER_CURSOR_TYPE } from "@cocalc/util/compute/manager";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";

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
  private interval;

  constructor({ client, path }: { client: SyncClient; path: string }) {
    log("creating remote jupyter session");
    this.client = client;
    // @ts-ignore: TODO
    this.client.is_compute_server = true;
    this.path = path;
    this.log("constructor");
    const syncdb_path = meta_file(path, "jupyter2");

    this.sync_db = client.sync_client.sync_db({
      ...SYNCDB_OPTIONS,
      project_id: client.project_id,
      path: syncdb_path,
    });

    this.registerWithProject();
    this.initRedux();
  }

  private log = (...args) => {
    log(`RemoteJupyter("${this.path}")`, ...args);
  };

  close = async () => {
    if (this.sync_db == null) {
      return;
    }
    this.log("close");
    clearInterval(this.interval);
    const { sync_db } = this;
    delete this.sync_db;
    sync_db.removeAllListeners("message");

    // Stop listening for messages, since as we start to close
    // things before, handling messages would lead to a crash.
    // clear our cursor, so project immediately knows that we disconnected.
    this.log("close: clearing cursors...");
    await sync_db.setCursorLocsNoThrottle([]);
    this.log("close: closing actions...");
    // we have to explicitly disable save here, since things are just
    // too complicated to properly do the close with a save after
    // we already started doing the close.
    await this.actions.close({ noSave: true });
    this.log("close: actions closed. Now destroying actions and store");
    this.actions.destroy();
    delete this.actions;
    this.store.destroy();
    delete this.store;
    await sync_db.close();
    this.log("close: done");
  };

  private registerWithProject = async () => {
    this.log("registering with project");
    if (this.sync_db.get_state() == "init") {
      await once(this.sync_db, "ready");
    }
    // Register to handle websocket api requests from frontend
    // clients to the project jupyter instance.
    this.sync_db.sendMessageToProject({ event: "register-to-handle-api" });

    // Periodically update cursor to indicate that we would like
    // to handle code evaluation, i.e., we are the cell running.
    const registerAsCellRunner = () => {
      this.log("registerAsCellRunner");
      if (this.sync_db == null) {
        return;
      }
      this.sync_db.setCursorLocsNoThrottle([
        { type: COMPUTER_SERVER_CURSOR_TYPE },
      ]);
    };
    this.interval = setInterval(registerAsCellRunner, COMPUTE_THRESH_MS / 2);
    registerAsCellRunner();
  };

  private initRedux = () => {
    this.log("initializing jupyter redux...");
    initJupyterRedux(this.sync_db, this.client);
    const { project_id } = this.client;
    const { path } = this;
    this.actions = redux.getEditorActions(project_id, path);
    if (this.actions.is_closed()) {
      throw Error(
        `initRedux -- actions can't be closed already (path="${path}")`,
      );
    }
    this.store = redux.getEditorStore(project_id, path);
  };
}
