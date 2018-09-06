/*
LEAN server
*/

const lean_files = {};

import { lean_server, Lean } from "./lean";
import { isEqual } from "underscore";

let the_lean_server: Lean | undefined = undefined;

function init_lean_server(client: any, logger: any): void {
  the_lean_server = lean_server(client);
  the_lean_server.on("tasks", function(path: string, tasks: object[]) {
    logger.debug("lean_server:websocket:tasks -- ", path, tasks);
    const lean_file = lean_files[`lean:${path}`];
    if (lean_file !== undefined && !isEqual(lean_file.tasks, tasks)) {
      lean_file.tasks = tasks;
      lean_file.channel.write({ tasks });
    }
  });

  the_lean_server.on("sync", function(path: string, hash: number) {
    logger.debug("lean_server:websocket:sync -- ", path, hash);
    const lean_file = lean_files[`lean:${path}`];
    if (lean_file !== undefined && !isEqual(lean_file.sync, hash)) {
      const sync = { hash: hash, time: new Date().valueOf() };
      lean_file.sync = sync;
      lean_file.channel.write({ sync });
    }
  });

  the_lean_server.on("messages", function(path: string, messages: object) {
    logger.debug("lean_server:websocket:messages -- ", path, messages);
    const lean_file = lean_files[`lean:${path}`];
    if (lean_file !== undefined && !isEqual(lean_file.messages, messages)) {
      lean_file.messages = messages;
      lean_file.channel.write({ messages });
    }
  });
}

export async function lean(
  client: any,
  primus: any,
  logger: any,
  path: string
): Promise<string> {
  if (the_lean_server === undefined) {
    init_lean_server(client, logger);
    if (the_lean_server === undefined) {
      // just to satisfy typescript.
      throw Error("lean server not defined");
    }
  }
  the_lean_server.register(path);

  // TODO: delete lean_files[name] under some condition.
  const name = `lean:${path}`;
  if (lean_files[name] !== undefined) {
    return name;
  }
  const channel = primus.channel(name);
  lean_files[name] = {
    channel,
    messages: []
  };

  channel.on("connection", function(spark: any): void {
    // make sure lean server cares:
    if (the_lean_server === undefined) {
      // just to satisfy typescript.
      throw Error("lean server not defined");
    }
    the_lean_server.register(path);

    const lean_file = lean_files[name];
    if (lean_file === undefined) {
      return;
    }
    // Now handle the connection
    logger.debug(
      "lean channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    spark.write({
      messages: lean_file.messages,
      sync: lean_file.sync,
      tasks: lean_file.tasks
    });
    spark.on("end", function() {});
    spark.on("data", function(data) {
      if (typeof data === "object") {
        // control message
        logger.debug("lean_file channel control message", JSON.stringify(data));
        switch (data.cmd) {
        }
      }
    });
  });

  return name;
}
