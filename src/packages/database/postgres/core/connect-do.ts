/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 5: Connection Management - _connect implementation
*/

import * as dns from "dns";
import * as pg from "pg";

import { getLogger } from "@cocalc/backend/logger";

import type { CB } from "@cocalc/util/types/callback";

import * as consts from "../../consts";
import { recordDisconnected } from "../record-connect-error";
import type { PostgreSQL } from "../types";

const DEFAULT_STATEMENT_TIMEOUT_MS = consts.STATEMENT_TIMEOUT_MS;
const winston = getLogger("postgres");

export async function connectDo(db: PostgreSQL, cb?: CB): Promise<void> {
  const dbAny = db as any;
  const dbg = db._dbg("_connect");
  dbg(`connect to ${db._host}`);
  dbAny._clear_listening_state(); // definitely not listening
  if (db._clients != null) {
    db.disconnect();
  }
  const locals: {
    clients: pg.Client[];
    hosts: Array<string | undefined>;
    clients_that_worked?: pg.Client[];
    errors?: unknown[];
  } = {
    clients: [],
    hosts: [],
  };
  dbAny._connect_time = 0;
  db._concurrent_queries = 0; // can't be any going on now.
  try {
    if (dbAny._ensure_exists) {
      dbg("first make sure db exists");
      await new Promise<void>((resolve, reject) => {
        dbAny._ensure_database_exists((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } else {
      dbg("assuming database exists");
    }

    if (!db._host) {
      // undefined if @_host=''
      locals.hosts = [undefined];
    } else if (db._host.indexOf("/") !== -1) {
      dbg("using a local socket file (not a hostname)");
      locals.hosts = [db._host];
    } else {
      const hostEntries = await Promise.all(
        db._host.split(",").map(async (host) => {
          const hostname = host.split(":")[0];
          winston.debug(`Looking up ip addresses of ${hostname}`);
          try {
            const ips = await new Promise<dns.LookupAddress[]>(
              (resolve, reject) => {
                dns.lookup(hostname, { all: true }, (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(results);
                  }
                });
              },
            );
            winston.debug(`Got ${hostname} --> ${JSON.stringify(ips)}`);
            return ips.map((x) => x.address);
          } catch (err) {
            winston.debug(`Got ${hostname} --> err=${err}`);
            // NON-FATAL -- we just don't include these and hope to
            // have at least one total working host...
            return [];
          }
        }),
      );
      locals.hosts = hostEntries.flat();
    }

    dbg(`connecting to ${JSON.stringify(locals.hosts)}...`);
    if (locals.hosts.length === 0) {
      dbg("locals.hosts has length 0 -- no available db");
      throw "no databases available";
    }

    dbg("create client and start connecting...");
    locals.clients = [];

    // Use a function to initialize the client, to avoid any issues with scope of "client" below.
    // Ref: https://node-postgres.com/apis/client
    const init_client = (host) => {
      const client = new pg.Client({
        user: db._user,
        host,
        port: db._port,
        password: db._password,
        database: db._database,
        ssl: db._ssl,
        statement_timeout: DEFAULT_STATEMENT_TIMEOUT_MS,
      }); // we set a statement_timeout, to avoid queries locking up PG
      if (dbAny._notification != null) {
        client.on("notification", dbAny._notification as any);
      }
      const onError = (err) => {
        // only listen once for error; after that we've
        // killed connection and don't care.
        client.removeListener("error", onError);
        if (dbAny._state === "init") {
          // already started connecting
          return;
        }
        db.emit("disconnect");
        recordDisconnected();
        dbg(`error -- ${err}`);
        db.disconnect();
        return db.connect({}); // start trying to reconnect
      };
      client.on("error", onError);
      client.setMaxListeners(0); // there is one emitter for each concurrent query... (see query_cb)
      locals.clients.push(client);
    };

    for (const host of Array.from(locals.hosts)) {
      init_client(host);
    }

    locals.clients_that_worked = [];
    locals.errors = [];
    await Promise.all(
      locals.clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.connect((err) => {
              if (err) {
                locals.errors?.push(err);
              } else {
                locals.clients_that_worked?.push(client);
              }
              resolve();
            });
          }),
      ),
    );
    if (!locals.clients_that_worked?.length) {
      console.warn("ALL clients failed", locals.errors);
      dbg("ALL clients failed", locals.errors);
      throw "ALL clients failed to connect";
    }
    if (locals.clients.length === locals.clients_that_worked.length) {
      dbg("ALL clients worked");
    } else {
      dbg(`ONLY ${locals.clients_that_worked.length} clients worked`);
    }
    locals.clients = locals.clients_that_worked;
    dbg("cb = ", cb);

    dbAny._connect_time = new Date();
    let i = 0;
    await Promise.all(
      locals.clients.map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            const it_hung = () => {
              reject("hung");
            };
            const timeout = setTimeout(it_hung, 15000);
            dbg(
              `now connected; checking if we can actually query the DB via client ${i}`,
            );
            i += 1;
            client.query("SELECT NOW()", (err) => {
              clearTimeout(timeout);
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
      ),
    );

    dbg(
      "checking if ANY db server is in recovery, i.e., we are doing standby queries only",
    );
    db.is_standby = false;
    await Promise.all(
      locals.clients.map(
        (client) =>
          new Promise<void>((resolve, reject) => {
            // Is this a read/write or read-only connection?
            client.query("SELECT pg_is_in_recovery()", (err, resp) => {
              if (err) {
                reject(err);
                return;
              }
              // True if ANY db connection is read only.
              if (resp.rows[0].pg_is_in_recovery) {
                db.is_standby = true;
              }
              resolve();
            });
          }),
      ),
    );

    db._clients = locals.clients;
    db._concurrent_queries = 0;
    dbg("connected!");
    if (typeof cb === "function") {
      cb(undefined, db);
    }
  } catch (err) {
    const mesg = `Failed to connect to database -- ${err}`;
    dbg(mesg);
    console.warn(mesg); // make it clear for interactive users with debugging off -- common mistake with env not setup right.
    // If we're unable to connect (or all clients fail), we are disconnected. This tells postgres/record-connect-error.ts about this problem.
    // See https://github.com/sagemathinc/cocalc/issues/5997 for some logs related to that.
    db.emit("disconnect");
    recordDisconnected();
    if (typeof cb === "function") {
      cb(err);
    }
  }
}
