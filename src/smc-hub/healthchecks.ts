/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// endpoints for various healthchecks

import * as debug from "debug";
const L = debug("hub:healthcheck");
import { Router } from "express";
import { isFloat } from "validator";
import { seconds2hms } from "../smc-util/misc";
const { database_is_working } = require("./hub_register");
import { PostgreSQL } from "./postgres/types";

interface Opts {
  router: Router;
  db: PostgreSQL;
}

// self termination is only activated, if there is a COCALC_HUB_SELF_TERMINATE environment variable
// it's value is an interval in hours, minimum and maximum, for how long it should live.
// e.g. "24,48" for between 1 and 2 days.
function init_self_terminate(): {
  startup: number;
  shutdown?: number; // when to shutdown (causes a failed health check)
  dead?: number; // when to return not-alive, causes a proxy server to no longer send traffic
} {
  const startup = Date.now();
  const conf = process.env.COCALC_HUB_SELF_TERMINATE;
  if (conf == null) {
    L("COCALC_HUB_SELF_TERMINATE not set, hence no self-termination");
    return { startup };
  }
  const [from_str, to_str] = conf.trim().split(",");
  if (!isFloat(from_str, { gt: 0 }))
    throw Error("COCALC_HUB_SELF_TERMINATE/from not a positive float");
  if (!isFloat(to_str, { gt: 0 }))
    throw Error("COCALC_HUB_SELF_TERMINATE/to not a positive float");
  const from = parseFloat(from_str);
  const to = parseFloat(to_str);
  if (from > to)
    throw Error(
      "COCALC_HUB_SELF_TERMINATE from must be smaller than to, e.g. '24,48'"
    );
  const uptime = Math.random() * (to - from); // hours
  const hours2ms = 1000 * 60 * 60;
  const shutdown = startup + uptime * hours2ms;
  // controlled shutdown: send out being "dead" 10 minutes or 10% before the actual shutdown
  const dead_period = Math.min(1 / 6, 0.1 * uptime); // hours
  const dead = shutdown - dead_period * hours2ms;
  L(
    `init_self_terminate: startup=${startup} dead=${dead} shutdown=${shutdown} uptime=${seconds2hms(
      hours2ms * uptime
    )}`
  );
  return { startup, shutdown, dead };
}

const { startup, shutdown, dead } = init_self_terminate();

interface Check {
  status: string;
  abort?: boolean;
}

export async function setup_healthchecks(opts: Opts): Promise<void> {
  const { router, db } = opts;

  // used by HAPROXY for testing that this hub is OK to receive traffic
  router.get("/alive", (_, res) => {
    res.type("txt");
    let msg = "alive: YES";
    let is_dead = true;
    if (!database_is_working()) {
      // this will stop haproxy from routing traffic to us
      // until db connection starts working again.
      msg = "alive: NO – database not working";
    } else if (dead != null && Date.now() > dead) {
      msg = "alive: NO – shutdown initiated";
    } else {
      is_dead = false;
    }
    if (is_dead) res.status(404);
    res.send(msg);
  });

  function check_concurrent(): Check {
    const c = db.concurrent();
    if (c >= db._concurrent_warn) {
      return {
        status: `hub not healthy, since concurrent ${c} >= ${db._concurrent_warn}`,
        abort: true,
      };
    } else {
      return { status: `concurrent ${c} < ${db._concurrent_warn}` };
    }
  }

  function check_uptime(): Check {
    const now = Date.now();
    const uptime = seconds2hms((now - startup) / 1000);
    if (shutdown != null) {
      if (now >= shutdown) {
        const msg = `uptime ${uptime} – expired, terminating now`;
        L(msg);
        return { status: msg, abort: true };
      } else {
        const until = seconds2hms((shutdown - now) / 1000);
        const msg = `uptime ${uptime} – terminating in ${until}`;
        L(msg);
        return { status: msg };
      }
    } else {
      const msg = `uptime ${uptime} – no self-termination`;
      L(msg);
      return { status: msg };
    }
  }

  // this is a more general check than concurrent-warn
  // additionally to checking the database condition, it also self-terminates
  // this hub if it is running for quite some time. beyond that, in the future
  // there could be even more checks on top of that.
  router.get("/healthcheck", (_, res) => {
    res.type("txt");
    let any_abort = false;
    let txt = "healthchecks:\n";
    for (const test of [check_concurrent(), check_uptime()]) {
      const { status, abort } = test;
      txt += `${status} – ${abort === true ? "FAIL" : "OK"}\n`;
      any_abort = any_abort || abort === true;
    }
    if (any_abort) res.status(404);
    res.send(txt);
  });

  // /concurrent-warn -- could be used by kubernetes to decide whether or not to kill the container; if
  // below the warn thresh, returns number of concurrent connection; if hits warn, then
  // returns 404 error, meaning hub may be unhealthy.  Kubernetes will try a few times before
  // killing the container.  Will also return 404 if there is no working database connection.
  router.get("/concurrent-warn", (_, res) => {
    res.type("txt");
    if (!database_is_working()) {
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
    res.type("txt");
    res.send(`${db.concurrent()}`);
  });
}
