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
    spark.on("data", async function(data) {
      if (the_lean_server == null) {
        // to satisfy typescript -- should never happen
        return;
      }
      if (typeof data === "object") {
        // control message
        logger.debug("lean_file channel control message", JSON.stringify(data));
        try {
          switch (data.cmd) {
            case "info":
              assert_type("line", data.line, "number");
              assert_type("column", data.column, "number");
              data.info = await the_lean_server.info(
                path,
                data.line,
                data.column
              );
              spark.write(data);
              return;
            case "complete":
              assert_type("line", data.line, "number");
              assert_type("column", data.column, "number");
              data.complete = await the_lean_server.complete(
                path,
                data.line,
                data.column,
                data.skipCompletions
              );
              if (data.complete.completions != undefined) {
                // delete the source fields -- they are LARGE and not used at all in the UI.
                for (let c of data.complete.completions) {
                  delete c.source;
                }
              }
              spark.write(data);
              return;
            default:
              throw Error(`unknown cmd ${data.cmd}`);
          }
        } catch (err) {
          data.err = err;
          spark.write(data);
        }
      }
    });
  });

  return name;
}

function assert_type(name: string, x: any, type: string): void {
  if (typeof x != type) {
    throw Error(`${name} must have type ${type}`);
  }
}
