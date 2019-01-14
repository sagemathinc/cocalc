import { isEqual } from "underscore";

import * as lean_client from "lean-client-js-node";
import { callback, delay } from "awaiting";
import { once } from "../smc-util/async-utils";
import { reuseInFlight } from "async-await-utils/hof";
import { EventEmitter } from "events";

type SyncString = any;
type Client = any;
type LeanServer = any;

// do not try to sync with lean more frequently than this
// unless it is completing quickly.
const SYNC_INTERVAL: number = 6000;

// What lean has told us about a given file.
type Message = any;
type Messages = Message[];

// What lean has told us about all files.
interface State {
  tasks: any;
  paths: { [key: string]: Messages };
}

export class Lean extends EventEmitter {
  paths: { [key: string]: SyncString } = {};
  client: Client;
  _server: LeanServer | undefined;
  _state: State = { tasks: [], paths: {} };
  private running: { [key: string]: number } = {};
  dbg: Function;

  constructor(client: Client) {
    super();
    this.server = reuseInFlight(this.server);
    this.client = client;
    this.dbg = this.client.dbg("LEAN SERVER");
    this.running = {};
  }

  close(): void {
    this.kill();
    delete this.client;
    delete this.paths;
    delete this._server;
  }

  is_running(path: string): boolean {
    return !!this.running[path] && now() - this.running[path] < SYNC_INTERVAL;
  }

  // nothing actually async in here... yet.
  private async server(): Promise<LeanServer> {
    if (this._server != undefined) {
      if (this._server.alive()) {
        return this._server;
      }
      // Kill cleans up any assumptions about stuff
      // being sync'd.
      this.kill();
      // New server will now be created... below.
    }
    this._server = new lean_client.Server(
      new lean_client.ProcessTransport(
        "lean",
        process.env.HOME ? process.env.HOME : ".", // satisfy typescript.
        []
      )
    );
    this._server.error.on(err => this.dbg("error:", err));
    this._server.allMessages.on(allMessages => {
      this.dbg("messages: ", allMessages);

      const new_messages = {};
      for (let x of allMessages.msgs) {
        const path: string = x.file_name;
        delete x.file_name;
        if (new_messages[path] === undefined) {
          new_messages[path] = [x];
        } else {
          new_messages[path].push(x);
        }
      }

      for (let path in this._state.paths) {
        this.dbg("messages for ", path, new_messages[path]);
        if (new_messages[path] === undefined) {
          new_messages[path] = [];
        }
        this.dbg(
          "messages for ",
          path,
          new_messages[path],
          this._state.paths[path]
        );
        // length 0 is a special case needed when going from pos number of messages to none.
        if (
          new_messages[path].length === 0 ||
          !isEqual(this._state.paths[path], new_messages[path])
        ) {
          this.dbg("messages for ", path, "EMIT!");
          this.emit("messages", path, new_messages[path]);
          this._state.paths[path] = new_messages[path];
        }
      }
    });

    this._server.tasks.on(currentTasks => {
      let { tasks } = currentTasks;
      this.dbg("tasks: ", tasks);
      const running = {};
      for (let task of tasks) {
        running[task.file_name] = true;
      }
      for (let path in running) {
        const v: any[] = [];
        for (let task of tasks) {
          if (task.file_name === path) {
            delete task.file_name; // no longer needed
            v.push(task);
          }
        }
        this.emit("tasks", path, v);
      }
      for (let path in this.running) {
        if (!running[path]) {
          this.dbg("server", path, " done; no longer running");
          this.running[path] = 0;
          this.emit("tasks", path, []);
          if (this.paths[path].changed) {
            // file changed while lean was running -- so run lean again.
            this.dbg(
              "server",
              path,
              " changed while running, so running again"
            );
            this.paths[path].on_change();
          }
        }
      }
    });
    this._server.connect();
    return this._server;
  }

  // Start learn server parsing and reporting info about the given file.
  // It will get updated whenever the file change.
  async register(path: string): Promise<void> {
    this.dbg("register", path);
    if (this.paths[path] !== undefined) {
      this.dbg("register", path, "already registered");
      return;
    }
    // get the syncstring and start updating based on content
    let syncstring: any = undefined;
    while (syncstring == null) { // todo change to be event driven!
      syncstring = this.client.syncdoc({ path });
      if (syncstring == null) {
        await delay(1000);
      } else if (syncstring.get_state() != "ready") {
        await once(syncstring, "ready");
      }
    }
    const on_change = async () => {
      this.dbg("sync", path);
      if (syncstring._closed) {
        this.dbg("sync", path, "closed");
        return;
      }
      if (this.is_running(path)) {
        // already running, so do nothing - it will rerun again when done with current run.
        this.dbg("sync", path, "already running");
        this.paths[path].changed = true;
        return;
      }

      const value: string = syncstring.to_str();
      if (this.paths[path].last_value === value) {
        this.dbg("sync", path, "skipping sync since value did not change");
        return;
      }
      if (value.trim() === "") {
        this.dbg(
          "sync",
          path,
          "skipping sync document is empty (and LEAN behaves weird in this case)"
        );
        this.emit("sync", path, syncstring.hash_of_live_version());
        return;
      }
      this.paths[path].last_value = value;
      this._state.paths[path] = [];
      this.running[path] = now();
      this.paths[path].changed = false;
      this.dbg("sync", path, "causing server sync now");
      await (await this.server()).sync(path, value);
      this.emit("sync", path, syncstring.hash_of_live_version());
    };
    this.paths[path] = {
      syncstring,
      on_change
    };
    syncstring.on("change", on_change);
    if (!syncstring._closed) {
      on_change();
    }
    syncstring.on("closed", () => {
      this.unregister(path);
    });
  }

  // Stop updating given file on changes.
  unregister(path: string): void {
    this.dbg("unregister", path);
    if (!this.paths[path]) {
      // not watching it
      return;
    }
    const x = this.paths[path];
    delete this.paths[path];
    delete this.running[path];
    x.syncstring.removeListener("change", x.on_change);
    x.syncstring.close();
  }

  // Kill the lean server and unregister all paths.
  kill(): void {
    this.dbg("kill");
    if (this._server != undefined) {
      for (let path in this.paths) {
        this.unregister(path);
      }
      this._server.dispose();
      delete this._server;
    }
  }

  async restart(): Promise<void> {
    this.dbg("restart");
    if (this._server != undefined) {
      for (let path in this.paths) {
        this.unregister(path);
      }
      await this._server.restart();
    }
  }

  async info(
    path: string,
    line: number,
    column: number
  ): Promise<lean_client.InfoResponse> {
    this.dbg("info", path, line, column);
    if (!this.paths[path]) {
      this.register(path);
      await callback(cb => this.once(`sync-#{path}`, cb));
    }
    return await (await this.server()).info(path, line, column);
  }

  async complete(
    path: string,
    line: number,
    column: number,
    skipCompletions?: boolean
  ): Promise<lean_client.CompleteResponse> {
    this.dbg("complete", path, line, column);
    if (!this.paths[path]) {
      this.register(path);
      await callback(cb => this.once(`sync-#{path}`, cb));
    }
    const resp = await (await this.server()).complete(
      path,
      line,
      column,
      skipCompletions
    );
    //this.dbg("complete response", path, line, column, resp);
    return resp;
  }

  async version(): Promise<string> {
    return (await this.server()).getVersion();
  }

  // Return state of parsing for everything that is currently registered.
  state(): State {
    return this._state;
  }

  messages(path: string): any[] {
    let x = this._state.paths[path];
    if (x !== undefined) {
      return x;
    }
    return [];
  }
}

let singleton: Lean | undefined;

// Return the singleton lean instance.  The client is assumed to never change.
export function lean_server(client: Client): Lean {
  if (singleton === undefined) {
    singleton = new Lean(client);
  }
  return singleton;
}

function now(): number {
  return new Date().valueOf();
}
