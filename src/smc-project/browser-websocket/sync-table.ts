/*
Channels used for optimizing realtime sync.
*/

import { EventEmitter } from "events";

const json = require("json-stable-stringify");

const sync_tables = {};

function get_name(query: object): string {
  return `sync:${json(query)}`;
}

export async function sync_table(
  client: any,
  primus: any,
  logger: any,
  query: object
): Promise<string> {
  const name = get_name(query);

  // The code below is way more complicated because LocalChannel
  // can be made *before* this sync function is called.  If that
  // happens, LocalChannel's history can have entries in it, and we
  // also have to set the channel of LocalChannel.

  if (
    sync_tables[name] !== undefined &&
    sync_tables[name].channel !== undefined
  ) {
    // fully initialized
    return name;
  }

  const channel = primus.channel(name);
  let history : any[];
  let local : LocalChannel;

  if (sync_tables[name] !== undefined) {
    history = sync_tables[name].history;
    local = sync_tables[name].local;
    local.channel = channel;
    sync_tables[name].channel = channel;
  } else {
    history = [];
    local = new LocalChannel(channel, history);
    sync_tables[name] = {
      local,
      channel,
      history
    }
  }

  channel.on("connection", function(spark: any): void {
    // Now handle a connection
    logger.debug("sync", name, `conn from ${spark.address.ip} -- ${spark.id}`);
    // send history
    spark.write(history);
    spark.on("end", function() {
      logger.debug("sync", name, `closed ${spark.address.ip} -- ${spark.id}`);
    });
    spark.on("data", function(data) {
      history.push(data);
      local._data_from_spark(data);
      channel.forEach(function(spark0, id) {
        if (id !== spark.id) {
          spark0.write(data);
        }
      });
    });
  });

  return name;
}

class LocalChannel extends EventEmitter {
  channel: any;
  history: any[];

  constructor(channel?: any, history: any[] = []) {
    super();
    this.channel = channel;
    this.history = history;
  }

  write(data: any): void {
    this.history.push(data);
    if (this.channel !== undefined) {
      this.channel.write(data);
    }
  }

  _data_from_spark(data: any): void {
    this.emit("data", data);
  }
}

export function local_sync_table(query: object): LocalChannel {
  const name = get_name(query);
  if (sync_tables[name] !== undefined) {
    return sync_tables[name].local;
  }
  const history: any[] = [];
  const local = new LocalChannel(undefined, history);
  sync_tables[name] = {
    local,
    history
  };
  return local;
}
