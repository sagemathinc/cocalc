/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// endpoints for various healthchecks

import * as debug from "debug";
const L = debug("hub:healthcheck");
import { Router } from "express";
import { seconds2hms } from "../smc-util/misc";
const { hub_register } = require("./hub_register");
import { PostgreSQL } from "./postgres/types";

interface Opts {
  router: Router;
  db: PostgreSQL;
}

const startup = Date.now();

export async function setup_healthchecks(opts: Opts): Promise<void> {
  const { router, db } = opts;

  // used by HAPROXY for testing that this hub is OK to receive traffic
  router.get("/alive", (_, res) => {
    if (!hub_register.database_is_working()) {
      // this will stop haproxy from routing traffic to us
      // until db connection starts working again.
      L("alive: answering *NO*");
      res.status(404).end();
    } else {
      res.send("alive");
    }
  });

  // this is a more general check than concurrent-warn
  // additionally to checking the database condition, it also self-terminates
  // this hub if it is running for quite some time. beyond that, in the future
  // there could be even more checks on top of that.
  router.get("/healthcheck", (_, res) => {
    const uptime_s = (Date.now() - startup) / 1000;
    L(`uptime ${seconds2hms(uptime_s)}`);
    res.send("OK");
  });

  // /concurrent-warn -- could be used by kubernetes to decide whether or not to kill the container; if
  // below the warn thresh, returns number of concurrent connection; if hits warn, then
  // returns 404 error, meaning hub may be unhealthy.  Kubernetes will try a few times before
  // killing the container.  Will also return 404 if there is no working database connection.
  router.get("/concurrent-warn", (_, res) => {
    if (!hub_register.database_is_working()) {
      L("/concurrent-warn: not healthy, since database connection not working");
      res.status(404).end();
      return;
    }

    const c = db.concurrent();
    if (c >= db._concurrent_warn) {
      L(
        `/concurrent-warn: not healthy, since concurrent ${c} >= ${db._concurrent_warn}`
      );
      res.status(404).end();
      return;
    }
    res.send(`${c}`);
  });

  // Return number of concurrent connections (could be useful)
  router.get("/concurrent", (_, res) => {
    res.send(`${db.concurrent()}`);
  });
}
