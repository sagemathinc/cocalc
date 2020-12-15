/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// endpoints for various healthchecks

import * as debug from "debug";
const L = debug("hub:healthcheck");
import { Router } from "express";
import { createServer } from "net";
import { isFloat } from "validator";
import { seconds2hms } from "../smc-util/misc";
const { database_is_working } = require("./hub_register");
import { PostgreSQL } from "./postgres/types";

// self termination is only activated, if there is a COCALC_HUB_SELF_TERMINATE environment variable
// it's value is an interval in hours, minimum and maximum, for how long it should be alive
// and a drain period in minutes at the end.
// e.g. "24,48,15" for an uptime between 1 and 2 days and 15 minutes of draining
function init_self_terminate(): {
  startup: number;
  shutdown?: number; // when to shutdown (causes a failed health check)
  drain?: number; // when to start draining, causes a proxy server to no longer send traffic
} {
  const startup = Date.now();
  const conf = process.env.COCALC_HUB_SELF_TERMINATE;
  if (conf == null) {
    L("COCALC_HUB_SELF_TERMINATE not set, hence no self-termination");
    return { startup };
  }
  const [from_str, to_str, drain_str] = conf.trim().split(",");
  if (!isFloat(from_str, { gt: 0 }))
    throw new Error("COCALC_HUB_SELF_TERMINATE/from not a positive float");
  if (!isFloat(to_str, { gt: 0 }))
    throw new Error("COCALC_HUB_SELF_TERMINATE/to not a positive float");
  if (!isFloat(drain_str, { gt: 0 }))
    throw new Error("COCALC_HUB_SELF_TERMINATE/drain not a positive float");
  const from = parseFloat(from_str);
  const to = parseFloat(to_str);
  const drain_h = parseFloat(drain_str) / 60; // minutes to hours
  if (from > to)
    throw Error(
      "COCALC_HUB_SELF_TERMINATE 'from' must be smaller than 'to', e.g. '24,48,15'"
    );
  const uptime = Math.random() * (to - from); // hours
  const hours2ms = 1000 * 60 * 60;
  const shutdown = startup + uptime * hours2ms;
  const drain = shutdown - drain_h * hours2ms;
  if (startup > drain) {
    throw new Error(
      `COCALC_HUB_SELF_TERMINATE: startup must be smaller than drain – ${startup}>${drain}`
    );
  }
  L(
    `init_self_terminate: startup=${startup} drain=${drain} shutdown=${shutdown} uptime=${seconds2hms(
      (hours2ms * uptime) / 1000
    )} draintime=${seconds2hms((drain_h * hours2ms) / 1000)}`
  );
  return { startup, shutdown, drain };
}

const { startup, shutdown, drain } = init_self_terminate();

let agent_port = 0;
let agent_host = "0.0.0.0";
export function set_agent_endpoint(port: number, host: string) {
  L(`set_agent_endpoint ${agent_host}:${agent_port}`);
  agent_port = port;
  agent_host = host;
}

let agent_check_server: any;

// HAProxy agent-check TCP endpoint
// https://cbonte.github.io/haproxy-dconv/2.0/configuration.html#5.2-agent-check
// for development, set the env var in your startup script or terminal init file
// export COCALC_HUB_SELF_TERMINATE=.1,.2,1
// and then query it like that
// $ telnet 0.0.0.0 $(cat $SMC_ROOT/dev/project/ports/agent-port)
export function setup_agent_check() {
  if (agent_port == 0 || drain == null) {
    L("setup_agent_check: agent_port not set, no agent checks");
    return;
  }

  // TODO this could also return a "weight" for this server, based on load values
  // there is also "drain", but we set it to "1%" to avoid a nasty situation, when all endpoints are draining
  agent_check_server = createServer((c) => {
    let msg = Date.now() < drain ? "ready" : "1%";
    c.write(msg + "\r\n");
    c.destroy();
  });

  agent_check_server.listen(agent_port, agent_host);
  L(`setup_agent_check: listening on ${agent_host}:${agent_port}`);
}

interface Opts {
  router: Router;
  db: PostgreSQL;
}

interface Check {
  status: string;
  abort?: boolean;
}

export async function setup_healthchecks(opts: Opts): Promise<void> {
  const { router, db } = opts;
  setup_agent_check();

  // used by HAPROXY for testing that this hub is OK to receive traffic
  router.get("/alive", (_, res) => {
    res.type("txt");
    let msg = "alive: YES";
    let is_dead = true;
    if (!database_is_working()) {
      // this will stop haproxy from routing traffic to us
      // until db connection starts working again.
      msg = "alive: NO – database not working";
    } else if (shutdown != null && Date.now() > shutdown) {
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
    if (shutdown != null && drain != null) {
      if (now >= shutdown) {
        const msg = `uptime ${uptime} – expired, terminating now`;
        L(msg);
        return { status: msg, abort: true };
      } else {
        const until = seconds2hms((shutdown - now) / 1000);
        const drain_str =
          drain > now
            ? `draining in ${seconds2hms((drain - now) / 1000)}`
            : "draining now";
        const msg = `uptime ${uptime} – ${drain_str} – terminating in ${until}`;
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
