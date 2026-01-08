/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Hub Registration

import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("hub_register");
import * as misc from "@cocalc/util/misc";
const { defaults, required } = misc;
import type { PostgreSQL } from "@cocalc/database/postgres/types";

// Global variables
let started = false;
let database_is_working = false;
let the_database: PostgreSQL | undefined = undefined;
let the_host: string | undefined = undefined;
let the_port: number | undefined = undefined;
let the_interval: number | undefined = undefined; // seconds

function register_hub(cb) {
  logger.debug("register_hub");
  if (the_database == null) {
    database_is_working = false;
    logger.debug("register_hub -- no database, so FAILED");
    cb?.("database not yet set");
    return;
  }
  if (the_database._clients == null) {
    database_is_working = false;
    logger.debug("register_hub -- not connected, so FAILED");
    cb?.("database not connected");
    return;
  }
  logger.debug("register_hub -- doing db query");
  if (the_host == null || the_port == null || the_interval == null) {
    throw new Error(
      "the_host, the_port, and the_interval must be set before registering this hub",
    );
  }
  the_database.register_hub({
    host: the_host,
    port: the_port,
    clients: 0, // TODO
    ttl: 3 * the_interval,
    cb(err) {
      if (err) {
        database_is_working = false;
        logger.debug(`register_hub -- fail - ${err}`);
      } else {
        database_is_working = true;
        logger.debug("register_hub -- success");
      }
      cb?.(err);
    },
  });
}

function _database_is_working() {
  return database_is_working;
}

export { _database_is_working as database_is_working };

interface Opts {
  database: PostgreSQL;
  host: string;
  port: number;
  interval_s: number;
  cb?: Function;
}

export function start(opts: Opts): void {
  opts = defaults(opts, {
    database: required,
    host: required,
    port: required,
    interval_s: required,
    cb: undefined,
  });
  logger.debug("hub_register.start...");
  if (started) {
    throw new Error("Can't start hub_register twice");
  } else {
    started = true;
  }
  the_database = opts.database;
  the_host = opts.host;
  the_port = opts.port;
  the_interval = opts.interval_s;
  register_hub(opts.cb);
  setInterval(register_hub, the_interval * 1000);
}
