/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote Jupyter backend session.
*/

import SyncClient from "@cocalc/sync-client";
import { meta_file } from "@cocalc/util/misc";
import { initJupyterRedux } from "@cocalc/jupyter/kernel";
import { redux } from "@cocalc/jupyter/redux/app";
import debug from "debug";
import { once } from "@cocalc/util/async-utils";
import { COMPUTE_THRESH_MS } from "@cocalc/util/compute/manager";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const log = debug("cocalc:compute:jupyter");

export function jupyter({ client, path }) {
  return new RemoteJupyter({ client, path });
}

class RemoteJupyter {
  private client: SyncClient;
  private websocket;
  private path: string;
  private syncdb;
  private actions?;
  private store?;
  private interval;

  constructor({ client, path }: { client: SyncClient; path: string }) {
    log("creating remote jupyter session");
    this.client = client;
    this.path = path;
    this.log("constructor");
    const syncdb_path = meta_file(path, "jupyter2");

    this.syncdb = client.sync_client.sync_db({
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
    if (this.syncdb == null) {
      return;
    }
    this.log("close");
    clearInterval(this.interval);

    this.log("save_asap");
    await this.actions.save_asap();
    this.log("halt kernel");
    await this.actions.halt();

    const { syncdb } = this;
    delete this.syncdb;
    syncdb.removeAllListeners("message");

    // Stop listening for messages, since as we start to close
    // things before, handling messages would lead to a crash.
    // clear our cursor, so project immediately knows that we disconnected.
    this.log("close: closing actions...");
    // we have to explicitly disable save here, since things are just
    // too complicated to properly do the close with a save after
    // we already started doing the close.
    this.actions.close({ noSave: true });
    this.log("close: actions closed");
    delete this.actions;
    delete this.store;
    this.log("close: clearing cursors...");
    await syncdb.setCursorLocsNoThrottle([]);
    await syncdb.close();
    this.log("close: done");
  };

  // On reconnect, this registerWithProject can in some cases get
  // called a bunch of times at once, so the reuseInFlight is
  // very important.  Otherwise, we end over a long time with
  // many disconnect and reconnects, with eventually more and
  // more attempts to register, and the process crashes and runs
  // out of memory.
  private registerWithProject = reuseInFlight(async () => {
    if (this.syncdb == null) {
      return;
    }
    this.log("registerWithProject");
    this.websocket = await this.client.project_client.websocket(
      this.client.project_id,
    );
    this.log("registerWithProject: got websocket");
    if (this.syncdb.get_state() == "init") {
      await once(this.syncdb, "ready");
    }
    this.log("registerWithProject: syncdb ready");
    // Register to handle websocket api requests from frontend
    // clients to the project jupyter instance.
    try {
      await this.syncdb.sendMessageToProject({
        event: "register-to-handle-api",
      });
    } catch (err) {
      this.log("WARNING: failed to register -- ", err);
      return;
    }
    this.log("registerWithProject: sent register-to-handle-api");

    // Periodically update cursor to indicate that we would like
    // to handle code evaluation, i.e., we are the cell running.
    if (this.interval) {
      clearInterval(this.interval);
      delete this.interval;
    }
    const registerAsCellRunner = async () => {
      this.log("registerAsCellRunner");
      if (this.syncdb == null) {
        return;
      }
      this.syncdb.registerAsComputeServer();
      // we also continually also register to handle messages, just in case
      // the above didn't get through (e.g., right when restarting project).
      await this.syncdb.sendMessageToProject({
        event: "register-to-handle-api",
      });
    };
    this.interval = setInterval(registerAsCellRunner, COMPUTE_THRESH_MS / 2);
    registerAsCellRunner();

    // remove it first, in case it was already installed:
    this.websocket.removeListener("state", this.handleWebsocketStateChange);
    this.websocket.on("state", this.handleWebsocketStateChange);
  });

  private handleWebsocketStateChange = (state) => {
    if (state == "offline") {
      // no point in registering with server while offline
      clearInterval(this.interval);
      delete this.interval;
    } else if (state == "online") {
      this.log("websocket online");
      this.registerWithProject();
    }
  };

  private initRedux = async () => {
    this.log("initializing jupyter redux...");
    await initJupyterRedux(this.syncdb, this.client);
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
