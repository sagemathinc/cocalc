/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This wraps a couple of static postgres connections in a "Pool",
// which does not clean up the session. This is different from pg.Pool!
// The technical reason is to keep the listen notifications open.
//
// TODO looking forward, a better strategy would be to split this up:
// i.e. use pg-pubsub for all listen notifications and pg.Pool for all standard queries.

import * as debug from "debug";
const LOG = debug("hub:pg:pool");

import { PostgreSQL } from "./types";
import { Client } from "pg";

interface Args {
  db: PostgreSQL;
  user: string;
  host: string;
  port: string;
  password: string;
  database: any;
  size: number;
}

export class PgStaticPool {
  private readonly db: PostgreSQL;
  private readonly user: string;
  private readonly host: string;
  private readonly port: string;
  private readonly password: string;
  private readonly database: any;
  private readonly clients: any[] = [];

  constructor(args: Args) {
    const { db, user, host, port, password, database } = args;
    this.db = db;
    this.user = user;
    this.host = host;
    this.port = port;
    this.password = password;
    this.database = database;
  }

  public async init() {
    this.clients.push(await this.create_client());
  }

  public async client() {
    const c = this.clients[0];
    LOG("returned client", c);
    return c;
  }

  private async create_client() {
    const client = new Client({
      user: this.user,
      host: this.host,
      port: this.port,
      password: this.password,
      database: this.database,
    });

    // setup client
    client.on("error", (err) => {
      if (this.db._state == "init") {
        // already started connecting
        return;
      }
      this.db.emit("disconnect");
      LOG(`pool.client error -- ${err}`);
      this.db.disconnect();
      this.db.connect(); // start trying to reconnect
    });

    if (this.db._notification != null) {
      //LOG("pool on notification set")
      client.on("notification", this.db._notification);
    }
    // throws if there is a problem
    await client.connect();
    return client;
  }
}
