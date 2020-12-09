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

// self termination is only activated, if there is a COCALC_HUB_SELF_TERMINATE environment variable
// it's value is an interval in hours, minimum and maximum, for how long it should live.
function init_self_terminate(): {
  startup: number;
  shutdown: number | undefined;
} {
  const startup = Date.now();

  const conf = process.env.COCALC_HUB_SELF_TERMINATE;
  const shutdown = conf != null ? 0 : undefined;
  return { startup, shutdown };
}

const { startup, shutdown } = init_self_terminate();

interface Check {
  status: string;
  abort?: boolean;
}

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
    L(`uptime ${uptime}`);
    if (shutdown != null) {
      if (now >= shutdown) {
        return { status: `BAD – uptime ${uptime}`, abort: true };
      } else {
        const until = seconds2hms(shutdown - now);
        return { status: `uptime ${uptime} – terminate in ${until}` };
      }
    } else {
      return { status: `uptime ${uptime}` };
    }
  }

  // this is a more general check than concurrent-warn
  // additionally to checking the database condition, it also self-terminates
  // this hub if it is running for quite some time. beyond that, in the future
  // there could be even more checks on top of that.
  router.get("/healthcheck", (_, res) => {
    res.write("healthchecks:\n");
    let any_abort = false;
    for (const test of [check_concurrent(), check_uptime()]) {
      const { status, abort } = test;
      L(status);
      res.write(status + "\n");
      any_abort = any_abort || abort === true;
    }
    if (any_abort) {
      res.status(404);
    }
    res.write("OK").end();
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
