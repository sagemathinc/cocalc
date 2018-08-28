import * as lean_client from "lean-client-js-node";
import { callback } from "awaiting";
import { EventEmitter } from "events";

// TODO: this is from
//import { aux_file } from "smc-webapp/frame-tree/util";
function path_split(path: string): any {
  const v = path.split("/");
  return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
}
function aux_file(path: string, ext: string): string {
  let s = path_split(path);
  s.tail += "." + ext;
  if (s.head) {
    return s.head + "/." + s.tail;
  } else {
    return "." + s.tail;
  }
}
// end todo


type SyncString = any;
type SyncDB = any;
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
  dbg: Function;

  constructor(client: Client) {
    super();
    this.client = client;
    this.dbg = this.client.dbg("LEAN SERVER");
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
        const path : string = x.file_name;
        delete x.file_name;
        if (this._state.paths[path] === undefined) {
          this._state.paths[path] = [x];
        } else {
          if (this._state.paths[path].length == 0) {
            // delete everything since this was caused by a new sync.
            // TODO: if we get rid of this._state.paths, we will need
            // to detect when to do this delete differently.
            const y = this.paths[path];
            if (y !== undefined) {
              y.syncdb.delete({type:'mesg'}, false);
            }
          }
          this._state.paths[path].push(x);
        }
        x.n = this._state.paths[path].length - 1;
        x.type = "mesg";
        const y = this.paths[path];
        if (y !== undefined) {
          y.syncdb.set(x, false);
          to_save[path] = true;
        }
      }
      for (let path in to_save) {
        this.paths[path].syncdb.save();
      }
    });
    this._server.tasks.on(currentTasks => {
      this.dbg("tasks: ", currentTasks.tasks);
      this._state.tasks = currentTasks.tasks;
    });
    this._server.connect();
    return this._server;
  }

  // Start learn server parsing and reporting info about the given file
  // It will get updated whenever the file change.
  register(path: string) {
    this.dbg("register", path);
    if (this.paths[path] !== undefined) {
      // already watching it
      return;
    }
    // get the syncstring and start updating based on content
    const syncstring: SyncString = this.client.sync_string({
      path: path
    });
    const that = this;
    async function on_change() {
      that.dbg("sync", path);
      that._state.paths[path] = [];
      await that.server().sync(path, syncstring.to_str());
      that.emit(`sync-${path}`);
    }
    const syncdb: SyncDB = this.client.sync_db({
      path: aux_file(path, "syncdb"),
      primary_keys: ["type", "n"]
    });
    this.paths[path] = {
      syncstring: syncstring,
      syncdb: syncdb,
      on_change: on_change
    };
    this.paths[path].syncstring.on("change", on_change);
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
    x.syncdb.close();
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

  tasks(): any {
    return this._state.tasks;
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

