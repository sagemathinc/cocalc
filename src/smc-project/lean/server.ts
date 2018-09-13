/*
LEAN server
*/

const lean_files = {};

import { cmp } from "../smc-webapp/frame-editors/generic/misc";

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

export async function lean_channel(
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
  });

  return name;
}

function assert_type(name: string, x: any, type: string): void {
  if (typeof x != type) {
    throw Error(`${name} must have type ${type}`);
  }
}

export async function lean(
  client: any,
  primus: any,
  logger: any,
  opts: any
): Promise<any> {
  if (the_lean_server === undefined) {
    init_lean_server(client, logger);
    if (the_lean_server === undefined) {
      // just to satisfy typescript.
      throw Error("lean server not defined");
    }
  }
  if (opts == null || typeof opts.cmd != "string") {
    throw Error("opts must be an object with cmd field a string");
  }
  // control message
  logger.debug("lean command", JSON.stringify(opts));
  switch (opts.cmd) {
    case "info":
      assert_type("path", opts.path, "string");
      assert_type("line", opts.line, "number");
      assert_type("column", opts.column, "number");
      const r = (await the_lean_server.info(opts.path, opts.line, opts.column))
        .record;
      return r ? r : {};

    // get server version
    case "version":
      return await the_lean_server.version();

    // kill the LEAN server.
    // this can help with, e.g., updating the LEAN_PATH
    case "kill":
      return the_lean_server.kill();

    case "complete":
      assert_type("path", opts.path, "string");
      assert_type("line", opts.line, "number");
      assert_type("column", opts.column, "number");
      const complete = await the_lean_server.complete(
        opts.path,
        opts.line,
        opts.column,
        opts.skipCompletions
      );
      if (complete == null || complete.completions == null) {
        return [];
      }
      // delete the source fields -- they are LARGE and not used at all in the UI.
      for (let c of complete.completions) {
        delete (c as any).source; // cast because of mistake in upstream type def.  sigh.
      }
      complete.completions.sort(function(a, b): number {
        if (a.text == null || b.text == null) {
          // satisfy typescript null checks; shouldn't happen.
          return 0;
        }
        return cmp(a.text.toLowerCase(), b.text.toLowerCase());
      });
      return complete.completions;

    default:
      throw Error(`unknown cmd ${opts.cmd}`);
  }
}
