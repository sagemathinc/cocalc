/*
SyncTable server channel -- used for supporting realtime sync
between project and browser client.
*/

type Query = { [key: string]: any };

interface Channel {
  on: (string, Function) => void;
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
  private client: Client;
  private logger: Logger;
  public readonly name: string;
  private query: Query;
  private query_string: string;
  private channel: Channel;

  constructor({
    client,
    primus,
    name,
    query,
    logger
  }: {
    client: Client;
    primus: Primus;
    name: string;
    query: Query;
    logger: Logger;
  }) {
    this.client = client;
    this.logger = logger;
    this.name = name;
    this.query = query;
    this.query_string = stringify(query);
    this.channel = primus.channel(this.name);
    this.log("creating new sync channel");
    this.init_handlers();

    console.log(this.client, this.query); // TODO: for now just to stop typescript unused complaints
  }

  private log(...args): void {
    this.logger.debug(`SyncChannel ${this.query_string} -- `, ...args);
  }

  private init_handlers(): void {
    this.channel.on("connection", this.new_connection.bind(this));
  }

  private new_connection(spark: any): void {
    // Now handle the connection
    this.log(`new connection from ${spark.address.ip} -- ${spark.id}`);
    spark.on("data", async data => {
      try {
        await this.handle_data(spark, data);
      } catch (err) {
        spark.write({ error: `error handling command -- ${err}` });
      }
    });
  }

  private async handle_data(spark, data): Promise<void> {
    this.log("handle_data ", data);
    // Echo it back
    spark.write(data);
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
  query: any
): Promise<string> {
  const s = sha1(stringify(query));
  const name = `sync:${s}`;
  if (sync_channels[name] === undefined) {
    sync_channels[name] = new SyncChannel({
      client,
      primus,
      name,
      query,
      logger
    });
  }
  return name;
}
