import * as lean_client from "lean-client-js-node";
import { callback, delay } from "awaiting";
import { EventEmitter } from "events";

import { path_split } from "../smc-webapp/frame-editors/generic/misc";

type SyncString = any;
type Client = any;
type LeanServer = any;

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
  private listening: { [key: string]: boolean } = {};
  dbg: Function;

  constructor(client: Client) {
    super();
    this.client = client;
    this.dbg = this.client.dbg("LEAN SERVER");
    this.listening = {};
  }

  close(): void {
    this.kill();
    delete this.client;
    delete this.paths;
    delete this._server;
  }

  server(): LeanServer {
    if (this._server != undefined) {
      return this._server;
    }
    this._server = new lean_client.Server(
      new lean_client.ProcessTransport("lean", ".", [])
    );
    this._server.error.on(err => this.dbg("error:", err));
    this._server.allMessages.on(allMessages => {
      this.dbg("messages: ", allMessages.msgs);
      const to_save = {};
      for (let x of allMessages.msgs) {
        const path: string = x.file_name;
        if (!this.listening[path]) {
          // ignore resent message data for a file that has not been updated.
          continue;
        }
        to_save[path] = true;
        delete x.file_name;
        if (this._state.paths[path] === undefined) {
          this._state.paths[path] = [x];
        } else {
          this._state.paths[path].push(x);
        }
      }
      for (let path in to_save) {
        const state = this._state.paths[path];
        if (state !== undefined) {
          this.emit("messages", path, state);
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
      for (let path in this.listening) {
        if (!running[path]) {
          this.listening[path] = false;
          if (
            this._state.paths[path] === undefined ||
            this._state.paths[path].length == 0
          ) {
            // nothing sent, so we need to update client to know
            this.emit("messages", path, []);
          }
          this.emit("tasks", path, []);
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
    let s = undefined;
    for (let i = 0; i < 60 && s === undefined; i++) {
      s = this.client.sync_string({
        path: path,
        reference_only: true
      });
      if (s === undefined) {
        this.dbg("register -- will try again", path);
        await delay(1000);
      }
    }
    if (s === undefined) {
      this.dbg("register -- failed", path);
      return; // failed to register
    }
    const syncstring = s as SyncString;
    const on_change = async () => {
      this.dbg("sync", path);

      this._state.paths[path] = [];
      this.listening[path] = true;

      await this.server().sync(path, syncstring.to_str());
      this.emit("sync", path);
    };
    this.paths[path] = {
      syncstring,
      on_change
    };
    syncstring.on("change", on_change);
    if (!syncstring._closed) {
      on_change();
    }
    syncstring.on("close", () => {
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
    x.syncstring.removeListener("change", x.on_change);
    x.syncstring.close();
    delete this.paths[path];
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
    return await this.server().info(path, line, column);
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
    return await this.server().complete(path, line, column, skipCompletions);
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
