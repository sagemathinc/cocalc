/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
SyncTable server channel -- used for supporting realtime sync
between project and browser client.

TODO:

- [ ] If initial query fails, need to raise exception.  Right now it gets
silently swallowed in persistent mode...
*/

// How long to wait from when we hit 0 clients until closing this channel.
// Making this short saves memory and cpu.
// Making it longer reduces the potential time to open a file, e.g., if you
// disconnect then reconnect, e.g., by refreshing your browser.
// Related to https://github.com/sagemathinc/cocalc/issues/5627
// and https://github.com/sagemathinc/cocalc/issues/5823
// and https://github.com/sagemathinc/cocalc/issues/5617

// This is a hard upper bound on the number of browser sessions that could
// have the same file open at once.  We put some limit on it, to at least
// limit problems from bugs which crash projects (since each connection uses
// memory, and it adds up).  Some customers want 100+ simultaneous users,
// so don't set this too low (except for dev)!
const MAX_CONNECTIONS = 500;

// The frontend client code *should* prevent many connections, but some
// old broken clients may not work properly.   This must be at least 2,
// since we can have two clients for a given channel at once if a file is
// being closed still, while it is reopened (e.g., when user does this:
// disconnect, change, close, open, reconnect).  Also, this setting prevents
// some potentially malicious conduct, and also possible new clients with bugs.
// It is VERY important that this not be too small, since there is often
// a delay/timeout before a channel is properly closed.
const MAX_CONNECTIONS_FROM_ONE_CLIENT = 10;

import {
  synctable_no_changefeed,
  synctable_no_database,
  SyncTable,
  VersionedChange,
  set_debug,
} from "@cocalc/sync/table";

// Only uncomment this for an intense level of debugging.
// set_debug(true);
// @ts-ignore -- typescript nonsense.
const _ = set_debug;

import { init_syncdoc, getSyncDocFromSyncTable } from "./sync-doc";
import { key, register_synctable } from "./open-synctables";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { close, deep_copy, len } from "@cocalc/util/misc";
import { registerListingsTable } from "./listings";
import { register_project_info_table } from "./project-info";
import { register_project_status_table } from "./project-status";
import { register_usage_info_table } from "./usage-info";
import Client from "@cocalc/sync-client";
import { getJupyterRedux } from "@cocalc/jupyter/kernel";
import { JUPYTER_SYNCDB_EXTENSIONS } from "@cocalc/util/jupyter/names";

type Query = { [key: string]: any };

interface Spark {
  address: { ip: string };
  id: string;
  conn: {
    id: string;
    write: (obj: any) => boolean;
    once: (str: string, fn: Function) => void;
    on: (str: string, fn: Function) => void;
    writable: boolean;
  };
  write: (obj: any) => boolean;
  end: (...args) => void;
  on: (str: string, fn: Function) => void;
}

interface Channel {
  write: (obj: any) => boolean;
  on: (str: string, fn: Function) => void;
  forEach: (fn: Function) => void;
  destroy: Function;
}

interface Primus {
  channel: (str: string) => Channel;
}

interface Logger {
  debug: Function;
}

import stringify from "json-stable-stringify";
import { sha1 } from "@cocalc/backend/sha1";

const COCALC_EPHEMERAL_STATE: boolean =
  process.env.COCALC_EPHEMERAL_STATE === "yes";

class SyncTableChannel {
  private synctable: SyncTable;
  private client: Client;
  private logger: Logger;
  public readonly name: string;
  private query: Query;
  private options: any[] = [];
  private query_string: string;
  private channel: Channel;
  private closed: boolean = false;
  private closing: boolean = false;
  private num_connections: { n: number; changed: Date } = {
    n: 0,
    changed: new Date(),
  };

  // If true, do not use a database at all, even on the backend.
  // Table is reset any time this object is created.  This is
  // useful, e.g., for tracking user cursor locations or other
  // ephemeral state.
  private ephemeral: boolean = false;

  // If true, do not close even if all clients have disconnected.
  // This is used to keep sessions running, even when all browsers
  // have closed, e.g., state for Sage worksheets, jupyter
  // notebooks, etc., where user may want to close their browser
  // (or just drop a connection temporarily) while a persistent stateful
  // session continues running.
  private persistent: boolean = false;

  private connections_from_one_client: { [id: string]: number } = {};

  constructor({
    client,
    primus,
    query,
    options,
    logger,
    name,
  }: {
    client: Client;
    primus: Primus;
    name: string;
    query: Query;
    options: any;
    logger: Logger;
  }) {
    this.name = name;
    this.client = client;
    this.logger = logger;
    this.query = query;
    this.init_options(options);
    if (COCALC_EPHEMERAL_STATE) {
      // No matter what, we set ephemeral true when
      // this env var is set, since all db access
      // will be denied anyways.
      this.ephemeral = true;
    }
    this.query_string = stringify(query)!; // used only for logging
    this.channel = primus.channel(this.name);
    this.log(
      `creating new sync channel (persistent=${this.persistent}, ephemeral=${this.ephemeral})`,
    );
  }

  public async init(): Promise<void> {
    this.init_handlers();
    await this.init_synctable();
  }

  private init_options(options): void {
    if (options == null) {
      return;
    }
    for (const option of deep_copy(options)) {
      // deep_copy so do not mutate input options.
      if (typeof option != "object" || option == null) {
        throw Error("invalid options");
      }
      for (const x of ["ephemeral", "persistent"]) {
        // options that are only for project websocket tables.
        if (option[x] != null) {
          this[x] = option[x];
          delete option[x];
        }
      }
      if (len(option) > 0) {
        // remaining synctable/database options.
        this.options.push(option);
      }
    }
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug(
      `SyncTableChannel('${this.name}', '${this.query_string}'${
        this.closed ? ",CLOSED" : ""
      }): `,
      ...args,
    );
  }

  private init_handlers(): void {
    this.log("init_handlers");
    this.channel.on("connection", this.new_connection.bind(this));
    this.channel.on("disconnection", this.end_connection.bind(this));
  }

  private async init_synctable(): Promise<void> {
    this.log("init_synctable");
    let create_synctable: Function;
    if (this.ephemeral) {
      this.log("init_synctable -- ephemeral (no database)");
      create_synctable = synctable_no_database;
    } else {
      this.log("init_synctable -- persistent (but no changefeeds)");
      create_synctable = synctable_no_changefeed;
    }
    this.synctable = create_synctable(this.query, this.options, this.client);

    // if the synctable closes, then the channel should also close.
    // I think this should happen, e.g., when we "close and halt"
    // a jupyter notebook, which closes the synctable, triggering this.
    this.synctable.once("closed", this.close.bind(this));

    if (this.query[this.synctable.get_table()][0].string_id != null) {
      register_synctable(this.query, this.synctable);
    }
    if (this.synctable.table === "syncstrings") {
      this.log("init_synctable -- syncstrings: also initialize syncdoc...");
      init_syncdoc(this.client, this.synctable);
    }

    this.synctable.on(
      "versioned-changes",
      this.send_versioned_changes_to_browsers.bind(this),
    );

    this.log("created synctable -- waiting for connected state");
    await once(this.synctable, "connected");
    this.log("created synctable -- now connected");

    // broadcast synctable content to all connected clients.
    this.broadcast_synctable_to_browsers();
  }

  private increment_connection_count(spark: Spark): number {
    // account for new connection from this particular client.
    let m: undefined | number = this.connections_from_one_client[spark.conn.id];
    if (m === undefined) m = 0;
    return (this.connections_from_one_client[spark.conn.id] = m + 1);
  }

  private decrement_connection_count(spark: Spark): number {
    const m: undefined | number =
      this.connections_from_one_client[spark.conn.id];
    if (m === undefined) {
      return 0;
    }
    return (this.connections_from_one_client[spark.conn.id] = Math.max(
      0,
      m - 1,
    ));
  }

  private async new_connection(spark: Spark): Promise<void> {
    // Now handle the connection
    const n = this.num_connections.n + 1;
    this.num_connections = { n, changed: new Date() };

    // account for new connection from this particular client.
    const m = this.increment_connection_count(spark);

    this.log(
      `new connection from (address=${spark.address.ip}, conn=${spark.conn.id}) -- ${spark.id} -- num_connections = ${n} (from this client = ${m})`,
    );

    if (m > MAX_CONNECTIONS_FROM_ONE_CLIENT) {
      const error = `Too many connections (${m} > ${MAX_CONNECTIONS_FROM_ONE_CLIENT}) from this client.  You might need to refresh your browser.`;
      this.log(
        `${error}  Waiting 15s, then killing new connection from ${spark.id}...`,
      );
      await delay(15000); // minimize impact of client trying again, which it should do...
      this.decrement_connection_count(spark);
      spark.end({ error });
      return;
    }

    if (n > MAX_CONNECTIONS) {
      const error = `Too many connections (${n} > ${MAX_CONNECTIONS})`;
      this.log(
        `${error} Waiting 5s, then killing new connection from ${spark.id}`,
      );
      await delay(5000); // minimize impact of client trying again, which it should do
      this.decrement_connection_count(spark);
      spark.end({ error });
      return;
    }

    if (this.closed) {
      this.log(`table closed: killing new connection from ${spark.id}`);
      this.decrement_connection_count(spark);
      spark.end();
      return;
    }
    if (this.synctable != null && this.synctable.get_state() == "closed") {
      this.log(`table state closed: killing new connection from ${spark.id}`);
      this.decrement_connection_count(spark);
      spark.end();
      return;
    }
    if (
      this.synctable != null &&
      this.synctable.get_state() == "disconnected"
    ) {
      // Because synctable is being initialized for the first time,
      // or it temporarily disconnected (e.g., lost hub), and is
      // trying to reconnect.  So just wait for it to connect.
      await once(this.synctable, "connected");
    }

    // Now that table is connected, we can send initial mesg to browser
    // with table state.
    this.send_synctable_to_browser(spark);

    spark.on("data", async (mesg) => {
      try {
        await this.handle_mesg_from_browser(mesg);
      } catch (err) {
        spark.write({ error: `error handling mesg -- ${err}` });
        this.log("error handling mesg -- ", err, err.stack);
      }
    });
  }

  private async end_connection(spark: Spark): Promise<void> {
    // This should never go below 0 (that would be a bug), but let's
    // just ewnsure it doesn't since if it did that would weirdly break
    // things for users as the table would keep trying to close.
    const n = Math.max(0, this.num_connections.n - 1);
    this.num_connections = { n, changed: new Date() };

    const m = this.decrement_connection_count(spark);
    this.log(
      `spark event -- end connection ${spark.address.ip} -- ${spark.id}  -- num_connections = ${n}  (from this client = ${m})`,
    );

    this.check_if_should_save_or_close();
  }

  private send_synctable_to_browser(spark: Spark): void {
    if (this.closed || this.closing || this.synctable == null) return;
    this.log("send_synctable_to_browser");
    spark.write({ init: this.synctable.initial_version_for_browser_client() });
  }

  private broadcast_synctable_to_browsers(): void {
    if (this.closed || this.closing || this.synctable == null) return;
    this.log("broadcast_synctable_to_browsers");
    const x = { init: this.synctable.initial_version_for_browser_client() };
    this.channel.write(x);
  }

  /* This is called when a user disconnects. This always triggers a save to
    disk.  It may also trigger closing the file in some cases. */
  private async check_if_should_save_or_close() {
    if (this.closed) {
      // don't bother if either already closed
      return;
    }
    this.log("check_if_should_save_or_close: save to disk if possible");
    try {
      await this.save_if_possible();
    } catch (err) {
      // the name "save if possible" suggests this should be non-fatal.
      this.log(
        "check_if_should_save_or_close: WARNING: unable to save -- ",
        err,
      );
    }
    const { n } = this.num_connections ?? {};
    this.log("check_if_should_save_or_close", { n });
    if (!this.persistent && n === 0) {
      this.log("check_if_should_save_or_close: close if possible");
      await this.close_if_possible();
    }
  }

  private handle_mesg_from_browser = async (mesg: any): Promise<void> => {
    // do not log the actual mesg, since it can be huge and make the logfile dozens of MB.
    // Temporarily enable as needed for debugging purposes.
    //this.log("handle_mesg_from_browser ", { mesg });
    if (this.closed) {
      throw Error("received mesg from browser AFTER close");
    }
    if (mesg == null) {
      throw Error("mesg must not be null");
    }
    if (mesg.timed_changes != null) {
      this.synctable.apply_changes_from_browser_client(mesg.timed_changes);
      await this.synctable.save();
    }
  };

  private send_versioned_changes_to_browsers = (
    versioned_changes: VersionedChange[],
  ): void => {
    if (this.closed) return;
    this.log("send_versioned_changes_to_browsers");
    const x = { versioned_changes };
    this.channel.write(x);
  };

  private async save_if_possible(): Promise<void> {
    if (this.closed || this.closing) {
      return; // closing or already closed
    }
    this.log("save_if_possible: saves changes to database");
    await this.synctable.save();
    if (this.synctable.table === "syncstrings") {
      this.log("save_if_possible: also fetch syncdoc");
      const syncdoc = getSyncDocFromSyncTable(this.synctable);
      if (syncdoc != null) {
        const path = syncdoc.get_path();
        this.log("save_if_possible: saving syncdoc to disk", { path });
        if (path.endsWith("." + JUPYTER_SYNCDB_EXTENSIONS)) {
          // treat jupyter notebooks in a special way, since they have
          // an aux .ipynb file that the syncdoc doesn't know about. In
          // this case we save the ipynb to disk, not just the hidden
          // syncdb file.
          const { actions } = await getJupyterRedux(syncdoc);
          if (actions == null) {
            this.log("save_if_possible: jupyter -- actions is null");
          } else {
            this.log("save_if_possible: jupyter -- saving to ipynb");
            await actions.save_ipynb_file();
          }
        }
        await syncdoc.save_to_disk();
      } else {
        this.log("save_if_possible: no syncdoc");
      }
    }
  }

  private async close_if_possible(): Promise<void> {
    if (this.closed || this.closing) {
      return; // closing or already closed
    }
    const { n, changed } = this.num_connections;
    const delay = Date.now() - changed.valueOf();
    this.log(
      `close_if_possible: there are ${n} connections and delay=${delay}`,
    );
    if (n === 0) {
      this.log(`close_if_possible: close this SyncTableChannel atomically`);
      // actually close
      this.close();
    } else {
      this.log(`close_if_possible: NOT closing this SyncTableChannel`);
    }
  }

  private close(): void {
    if (this.closed) {
      return;
    }
    this.log("close: closing");
    this.closing = true;
    delete synctable_channels[this.name];
    this.channel.destroy();
    this.synctable.close_no_async();
    this.log("close: closed");
    close(this); // don't call this.log after this!
    this.closed = true;
  }

  public get_synctable(): SyncTable {
    return this.synctable;
  }
}

const synctable_channels: { [name: string]: SyncTableChannel } = {};

function createKey(args): string {
  return stringify([args[3], args[4]])!;
}

function channel_name(query: any, options: any[]): string {
  // stable identifier to this query + options across
  // project restart, etc.   We first make the options
  // as canonical as we can:
  const opts = {};
  for (const x of options) {
    for (const key in x) {
      opts[key] = x[key];
    }
  }
  // It's critical that we dedup the synctables having
  // to do with sync-doc's.   A problem case is multiple
  // queries for the same table, due to the time cutoff
  // for patches after making a snapshot.
  let q: string;
  try {
    q = key(query);
  } catch {
    // throws an error if the table doesn't have a string_id;
    // that's fine - in this case, just make a key out of the query.
    q = query;
  }
  const y = stringify([q, opts])!;
  const s = sha1(y);
  return `sync:${s}`;
}

async function synctable_channel0(
  client: any,
  primus: any,
  logger: any,
  query: any,
  options: any[],
): Promise<string> {
  const name = channel_name(query, options);
  logger.debug("synctable_channel", JSON.stringify(query), name);
  if (synctable_channels[name] === undefined) {
    synctable_channels[name] = new SyncTableChannel({
      client,
      primus,
      name,
      query,
      options,
      logger,
    });
    await synctable_channels[name].init();
    if (query?.listings != null) {
      registerListingsTable(synctable_channels[name].get_synctable(), query);
    } else if (query?.project_info != null) {
      register_project_info_table(
        synctable_channels[name].get_synctable(),
        logger,
        client.client_id(),
      );
    } else if (query?.project_status != null) {
      register_project_status_table(
        synctable_channels[name].get_synctable(),
        logger,
        client.client_id(),
      );
    } else if (query?.usage_info != null) {
      register_usage_info_table(
        synctable_channels[name].get_synctable(),
        client.client_id(),
      );
    }
  }
  return name;
}

export const synctable_channel = reuseInFlight(synctable_channel0, {
  createKey,
});
