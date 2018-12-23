/*
SyncTable server channel -- used for supporting realtime sync
between project and browser client.

TODO:

- [ ] If initial query fails, need to raise exception.  Right now it gets
silently swallowed in persistent mode...
*/

import {
  synctable_no_changefeed,
  synctable_no_database,
  SyncTable
} from "../smc-util/sync/table";

import { init_syncdoc } from "./sync-doc";

import { register_synctable } from "./open-synctables";

import { once } from "../smc-util/async-utils";

const { is_array } = require("../smc-util/misc");

type Query = { [key: string]: any };

interface Spark {
  address: { ip: string };
  id: string;
  write: (string) => void;
  on: (string, Function) => void;
}

interface Channel {
  on: (string, Function) => void;
  forEach: (Function) => void;
}

import { Client } from "../smc-util/sync/editor/generic/types";

interface Primus {
  channel: (string) => Channel;
}

interface Logger {
  debug: Function;
}

import * as stringify from "fast-json-stable-stringify";
const { sha1 } = require("smc-util-node/misc_node");

class SyncChannel {
  private synctable: SyncTable;
  private client: Client;
  private logger: Logger;
  public readonly name: string;
  private query: Query;
  private options: any[] = [];
  private query_string: string;
  private channel: Channel;

  // If true, do not use a database at all, even on the backend.
  // Table is reset any time this object is created.  This is
  // useful, e.g., for tracking user cursor locations or other
  // ephemeral state.
  private ephemeral: boolean = false;

  constructor({
    client,
    primus,
    name,
    query,
    options,
    logger
  }: {
    client: Client;
    primus: Primus;
    name: string;
    query: Query;
    options: any;
    logger: Logger;
  }) {
    this.client = client;
    this.logger = logger;
    this.name = name;
    this.query = query;
    this.init_options(options);
    this.query_string = stringify(query); // used only for logging
    this.channel = primus.channel(this.name);
    this.log("creating new sync channel");
    this.init_handlers();
    this.init_synctable();
  }

  private init_options(options): void {
    if (options == null) {
      return;
    }
    for (let option of options) {
      if (typeof option != "object" || option == null) {
        throw Error("invalid options");
      }
      if (option.ephemeral != null) {
        this.ephemeral = option.ephemeral;
      } else {
        this.options.push(option);
      }
    }
  }

  private log(...args): void {
    this.logger.debug(
      `SyncChannel('${this.name}', '${this.query_string}'): `,
      ...args
    );
  }

  private init_handlers(): void {
    this.log("init_handlers");
    this.channel.on("connection", this.new_connection.bind(this));
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
    if (this.query[this.synctable.table].string_id != null) {
      register_synctable(this.query, this.synctable);
    }
    if (this.synctable.table === "syncstrings") {
      this.log("init_synctable -- syncstrings: also initialize syncdoc...");
      init_syncdoc(this.client, this.synctable, this.logger);
    }
    this.synctable.on("saved-objects", this.handle_synctable_save.bind(this));
    this.log("created synctable -- waiting for connected state");
    await once(this.synctable, "connected");
    this.log("created synctable -- now connected");
    // broadcast synctable content to all connected clients.
    this.broadcast_synctable_all();
  }

  private new_connection(spark: Spark): void {
    // Now handle the connection
    this.log(`new connection from ${spark.address.ip} -- ${spark.id}`);
    this.send_synctable_all(spark);

    spark.on("data", async data => {
      try {
        await this.handle_data(spark, data);
      } catch (err) {
        spark.write({ error: `error handling command -- ${err}` });
        this.log("error handling command -- ", err, err.stack);
      }
    });
  }

  private synctable_all(): any[] | undefined {
    const all = this.synctable.get();
    if (all === undefined) {
      return;
    }
    return all.valueSeq().toJS();
  }

  private send_synctable_all(spark: Spark): void {
    this.log("send_synctable_all");
    const new_val = this.synctable_all();
    if (new_val == null) {
      return;
    }
    spark.write({ new_val });
  }

  private broadcast_synctable_all(): void {
    this.log("broadcast_synctable_all");
    const new_val = this.synctable_all();
    if (new_val == null) {
      return;
    }
    this.channel.forEach((spark: Spark) => {
      spark.write({ new_val });
    });
  }

  private handle_synctable_save(saved_objs): void {
    if (saved_objs.length === 0) {
      return;
    }
    this.channel.forEach((spark: Spark) => {
      spark.write({ new_val: saved_objs });
    });
  }

  private async handle_data(_: Spark, data: any): Promise<void> {
    this.log("handle_data ", (this.channel as any).channel, data);
    if (!is_array(data)) {
      throw Error("data must be an array of set objects");
    }
    for (let new_val of data) {
      // We use set instead of "this.synctable.synthetic_change({new_val}, true);"
      // so these changes get saved to the database.
      // When the backend is also making changes, we
      // may need to be very careful...
      this.synctable.set(new_val, "shallow", true);
    }
  }

  public close(): void {
    // TODO.
    // will want to close and cleanup a channel if there are
    // no connected sparks for at least k minutes...
    // Except for compute (sagews, ipynb), it will be different.
  }
}

const sync_channels: { [name: string]: SyncChannel } = {};

export async function sync_channel(
  client: any,
  primus: any,
  logger: any,
  query: any,
  options: any
): Promise<string> {
  // stable identifier to this query with these options, across
  // project restart, etc:
  const s = sha1(stringify([query, options]));
  const name = `sync:${s}`;
  if (sync_channels[name] === undefined) {
    sync_channels[name] = new SyncChannel({
      client,
      primus,
      name,
      query,
      options,
      logger
    });
  }
  return name;
}
