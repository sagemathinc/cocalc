/*
Synctable that uses the project websocket rather than the database.
*/

import { reuseInFlight } from "async-await-utils/hof";

import { synctable_no_database, SyncTable } from "smc-util/sync/table";

import { once, retry_until_success } from "smc-util/async-utils";

interface Client {
  touch_project: ({
    project_id,
    cb
  }: {
    project_id: string;
    cb?: Function;
  }) => Promise<any>;
  project_websocket: (project_id: string) => Promise<any>;
  set_connected: (connected: boolean) => void;
}

interface Options {
  project_id: string;
  query: any;
  options: any;
  client: Client;
  throttle_changes?: undefined | number;
}

import { EventEmitter } from "events";

class SyncTableChannel extends EventEmitter {
  public synctable: SyncTable;
  private project_id: string;
  private client: Client;
  private channel?: any;
  private websocket?: any;
  private query: any;
  private options: any;
  private key: string;

  private connected: boolean = false;

  constructor(opts: Options) {
    super();
    const { project_id, query, options, client, throttle_changes } = opts;
    this.key = key(opts);
    this.synctable = synctable_no_database(
      query,
      options,
      client,
      throttle_changes,
      [],
      project_id
    );
    (this.synctable as any).channel = this; // for debugging
    this.project_id = project_id;
    this.client = client;
    this.query = query;
    this.options = options;
    this.init_synctable_handlers();

    this.connect = reuseInFlight(this.connect.bind(this));
    this.log = this.log.bind(this);
    this.connect();
  }

  public is_connected(): boolean {
    return this.connected;
  }

  private log(..._args): void {
    //console.log("SyncChannel", this.query, ..._args);
  }

  private async connect(): Promise<void> {
    if (this.synctable == null) return;
    this.set_connected(false);
    await retry_until_success({
      max_delay: 5000,
      f: this.attempt_to_connect.bind(this),
      desc: "webapp-synctable-connect",
      log: this.log
    });
  }

  private set_connected(connected: boolean): void {
    if (this.synctable == null) return;
    this.log("set_connected", connected);
    this.connected = connected;
    this.synctable.client.set_connected(connected);
    if (connected) {
      this.emit("connected");
    } else {
      this.emit("disconnected");
    }
  }
  // Various things could go wrong, e.g., the websocket breaking
  // while trying to get the api synctable_channel, touch
  // project might time out, etc.
  private async attempt_to_connect(): Promise<void> {
    // Start with fresh websocket and channel -- old one may be dead.
    this.clean_up_sockets();
    // touch_project mainly makes sure that some hub is connected to
    // the project, so the project can do DB queries.  Also
    // starts the project.
    this.client.touch_project({ project_id: this.project_id });
    // Get a websocket.
    this.websocket = await this.client.project_websocket(this.project_id);
    if (this.websocket.state != "online") {
      // give websocket state once chance to change.
      // It could change to destroyed or online.
      await once(this.websocket, "state");
    }
    if (this.websocket.state != "online") {
      // Already offline... let's try again from the top.
      throw Error("websocket went offline already");
    }
    // Get a channel.
    this.channel = await this.websocket.api.synctable_channel(
      this.query,
      this.options
    );
    if (this.websocket.state != "online") {
      // Already offline... let's try again from the top.
      throw Error("websocket went offline already");
    }

    this.channel.on("data", this.handle_mesg_from_project.bind(this));

    // The moment the websocket goes offline, connect again.
    this.websocket.once("offline", this.connect);

    this.channel.on("close", this.connect);
    this.channel.on("open", this.connect);
  }

  private init_synctable_handlers(): void {
    this.synctable.on("timed-changes", timed_changes => {
      this.send_mesg_to_project({ timed_changes });
    });
    this.synctable.once("closed", this.close.bind(this));
  }

  private async clean_up_sockets(): Promise<void> {
    if (this.channel != null) {
      this.channel.removeAllListeners();
      this.channel.end();
      delete this.channel;
    }
    if (this.websocket != null) {
      this.websocket.removeListener("offline", this.connect);
      delete this.websocket;
    }
  }

  private close(): void {
    delete cache[this.key];
    this.clean_up_sockets();
    if (this.synctable != null) {
      this.synctable.close();
      delete this.synctable;
    }
  }

  private handle_mesg_from_project(mesg): void {
    this.log("project --> client: ", mesg);
    if (this.synctable == null) {
      this.log("project --> client: NO SYNCTABLE");
      return; // can happen during close
    }
    if (mesg == null) {
      throw Error("mesg must not be null");
    }
    if (mesg.init != null) {
      this.log("project --> client: init_browser_client");
      this.synctable.init_browser_client(mesg.init);
      // after init message, we are now initialized
      // and in the connected state.
      this.set_connected(true);
    }
    if (mesg.versioned_changes != null) {
      this.log("project --> client: versioned_changes");
      this.synctable.apply_changes_to_browser_client(mesg.versioned_changes);
    }
  }

  private send_mesg_to_project(mesg): void {
    this.log("project <-- client: ", mesg);
    if (
      !this.connected ||
      this.websocket == null ||
      this.channel == null ||
      this.websocket.state != "online"
    ) {
      throw Error("websocket must be online");
    }

    this.channel.write(mesg);
  }
}

// We use a cache to ensure there is at most one synctable
// at a time with given defining parameters.  This is just
// for efficiency and sanity, so we use JSON.stringify instead
// of a guranteed stable json.
const cache: { [key: string]: SyncTableChannel } = {};

(window as any).channel_cache = cache;

function key(opts: Options): string {
  return `${opts.project_id}-${JSON.stringify(opts.query)}-${JSON.stringify(
    opts.options
  )}`;
}

export async function synctable_project(opts: Options): Promise<SyncTable> {
  const k = key(opts);
  let t;
  if (cache[k] !== undefined) {
    t = cache[k];
  } else {
    t = new SyncTableChannel(opts);
    cache[k] = t;
  }
  if (!t.is_connected()) {
    await once(t, "connected");
  }
  return t.synctable;
}
