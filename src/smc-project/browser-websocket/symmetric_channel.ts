/*
Channels used for optimizing realtime sync.
*/

import { EventEmitter } from "events";

const json = require("json-stable-stringify");

const sync_tables = {};

function get_name(name: string): string {
  return `symmetric_channel:${name}`;
}

export async function browser_symmetric_channel(
  client: any,
  primus: any,
  logger: any,
  name: string
): Promise<string> {
  name = get_name(name);

  // The code below is way more complicated because SymmetricChannel
  // can be made *before* this sync function is called.  If that
  // happens, and we also have to set the channel of SymmetricChannel.

  if (
    sync_tables[name] !== undefined &&
    sync_tables[name].channel !== undefined
  ) {
    // fully initialized
    return name;
  }

  const channel = primus.channel(name);
  let local: SymmetricChannel;

  if (sync_tables[name] !== undefined) {
    local = sync_tables[name].local;
    local.channel = channel;
    sync_tables[name].channel = channel;
  } else {
    local = new SymmetricChannel(channel);
    sync_tables[name] = {
      local,
      channel
    };
  }

  channel.on("connection", function(spark: any): void {
    // Now handle a connection
    logger.debug("sync", name, `conn from ${spark.address.ip} -- ${spark.id}`);
    spark.on("end", function() {
      logger.debug("sync", name, `closed ${spark.address.ip} -- ${spark.id}`);
    });
    spark.on("data", function(data) {
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

class SymmetricChannel extends EventEmitter {
  channel: any;

  constructor(channel?: any) {
    super();
    this.channel = channel;
  }

  // Returns true if immediate write succeeds
  write(data: any): boolean {
    if (this.channel !== undefined) {
      return this.channel.write(data);
    }
    return false;
  }

  _data_from_spark(data: any): void {
    this.emit("data", data);
  }
}

export function symmetric_channel(name: string): SymmetricChannel {
  name = get_name(name);
  if (sync_tables[name] !== undefined) {
    return sync_tables[name].local;
  }
  const local = new SymmetricChannel(undefined);
  sync_tables[name] = { local };
  return local;
}

