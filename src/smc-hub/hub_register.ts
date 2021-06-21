/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Hub Registration (recording number of clients)

const winston = require("./logger").getLogger("hub");
import * as misc from "smc-util/misc";
const { defaults, required } = misc;
import { PostgreSQL } from "./postgres/types";

// Global variables
let started = false;
let database_is_working = false;
let the_database: PostgreSQL | undefined = undefined;
let the_host: string | undefined = undefined;
let the_port: number | undefined = undefined;
let the_interval: number | undefined = undefined; // seconds
let the_clients: any = {};

const number_of_clients = () => misc.len(the_clients);

function _number_of_clients() {
  if (the_database == null) {
    throw new Error("database not yet set");
  }
  return number_of_clients();
}

export { _number_of_clients as number_of_clients };

function register_hub(cb) {
  winston.debug("register_hub");
  if (the_database == null) {
    database_is_working = false;
    winston.debug("register_hub -- no database, so FAILED");
    cb?.("database not yet set");
    return;
  }
  if (the_database._clients == null) {
    database_is_working = false;
    winston.debug("register_hub -- not connected, so FAILED");
    cb?.("database not connected");
    return;
  }
  if (the_database.is_standby) {
    winston.debug("register_hub -- doing read query of site settings");
    the_database.get_site_settings({
      cb(err, _) {
        if (err) {
          winston.debug("register_hub -- FAILED read query");
          database_is_working = false;
        } else {
          winston.debug("register_hub -- read query worked");
          database_is_working = true;
        }
      },
    });
    return;
  }

  winston.debug("register_hub -- doing db query");
  if (the_host == null || the_port == null || the_interval == null) {
    throw new Error(
      "the_host, the_port, and the_interval must be set before registering this hub"
    );
  }
  the_database.register_hub({
    host: the_host,
    port: the_port,
    clients: number_of_clients(),
    ttl: 3 * the_interval,
    cb(err) {
      if (err) {
        database_is_working = false;
        winston.debug(`register_hub -- fail - ${err}`);
      } else {
        database_is_working = true;
        winston.debug("register_hub -- success");
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
  clients: any;
  host: string;
  port: number;
  interval_s: number;
  cb?: Function;
}

export function start(opts: Opts): void {
  opts = defaults(opts, {
    database: required,
    clients: required,
    host: required,
    port: required,
    interval_s: required,
    cb: undefined,
  });
  winston.debug("hub_register.start...");
  if (started) {
    throw new Error("Can't start hub_register twice");
  } else {
    started = true;
  }
  the_database = opts.database;
  the_clients = opts.clients;
  the_host = opts.host;
  the_port = opts.port;
  the_interval = opts.interval_s;
  register_hub(opts.cb);
  setInterval(register_hub, the_interval * 1000);
}
