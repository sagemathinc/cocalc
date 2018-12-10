/*
SyncTable server channel -- used for supporting realtime sync
between project and browser client.

TODO:

- [ ] initially synctable will just be a normal synctable
      with a changefeed, but for efficiency we'll change
      it to NOT be a changefeed.
*/

import { synctable_no_changefeed, SyncTable } from "../smc-util/sync/table";

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

interface Client {}

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
  private options: any;
  private query_string: string;
  private channel: Channel;

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
    this.options = options;
    this.query_string = stringify(query); // used only for logging
    this.channel = primus.channel(this.name);
    this.log("creating new sync channel");
    this.init_handlers();
    this.init_synctable();
  }

  private log(...args): void {
    this.logger.debug(`SyncChannel ${this.query_string} -- `, ...args);
  }

  private init_handlers(): void {
    this.log("init_handlers");
    this.channel.on("connection", this.new_connection.bind(this));
  }

  private async init_synctable(): Promise<void> {
    this.log("init_synctable");
    this.synctable = synctable_no_changefeed(
      this.query,
      this.options,
      this.client
    );
    this.synctable.on("saved-objects", this.handle_synctable_save.bind(this));
    this.log("created synctable -- waiting for connect");
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
    const s = this.synctable_all();
    if (s == null) {
      return;
    }
    spark.write(s);
  }

  private broadcast_synctable_all(): void {
    this.log("broadcast_synctable_all");
    const s = this.synctable_all();
    if (s == null) {
      return;
    }
    this.channel.forEach((spark: Spark) => {
      spark.write(s);
    });
  }

  private handle_synctable_save(saved_objs): void {
    this.channel.forEach((spark: Spark) => {
      spark.write(saved_objs);
    });
  }

  private async handle_data(_: Spark, data: any): Promise<void> {
    this.log("handle_data ", data);
    if (!is_array(data)) {
      throw Error("data must be an array of set objects");
    }
    for (let x of data) {
      this.synctable.set(x);
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
