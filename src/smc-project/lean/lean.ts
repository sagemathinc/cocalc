import * as lean_client from "lean-client-js-node";
import { callback } from "awaiting";
import { EventEmitter } from "events";

type SyncString = any;
type Client = any;
type LeanServer = any;

// What lean has told us about a given file.
interface PathState {}

// What lean has told us about all files.
interface State {
  [key: string]: PathState;
}

export class Lean extends EventEmitter {
  paths: { [key: string]: SyncString } = {};
  client: Client;
  _server: LeanServer | undefined;
  _state: State = {};

  constructor(client: Client) {
    super();
    this.client = client;
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
    this._server.error.on(err => console.log("error:", err));
    this._server.allMessages.on(allMessages =>
      console.log("messages: ", allMessages.msgs)
    );
    this._server.tasks.on(currentTasks =>
      console.log("tasks: ", currentTasks.tasks)
    );
    this._server.connect();
    return this._server;
  }

  // Start learn server parsing and reporting info about the given file
  // It will get updated whenever the file change.
  register(path: string) {
    if (this.paths[path] !== undefined) {
      // already watching it
      return;
    }
    // get the syncstring and start updating based on content
    const syncstring: SyncString = this.client.sync_string({
      path: this.paths
    });
    async function on_change() {
      await this.server().sync(path, syncstring.to_str());
      this.emit(`sync-${path}`);
    }
    this.paths[path] = {
      syncstring: syncstring,
      on_change: on_change
    };
    this.paths[path].on("change", on_change);
  }

  // Stop updating given file on changes.
  unregister(path: string): void {
    if (!this.paths[path]) {
      // not watching it
      return;
    }
    const x = this.paths[path];
    x.removeListener("change", x.on_change);
    x.syncstring.close();
    delete this.paths[path];
  }

  // Kill the lean server and unregister all paths.
  kill(): void {
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
}

let singleton: Lean | undefined;

// Return the singleton lean instance.  The client is assumed to never change.
export function lean(client: Client): Lean {
  if (singleton === undefined) {
    singleton = new Lean(client);
  }
  return singleton;
}
