/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// endpoints for various health checks

import * as debug from "debug";
const L = debug("hub:healthcheck");
import { Router, Response } from "express";
import { createServer } from "net";
import { isFloat } from "validator";
import { seconds2hms } from "smc-util/misc";
import { database_is_working } from "./hub_register";
import { PostgreSQL } from "./postgres/types";

interface HealthcheckData {
  code: 200 | 404;
  txt: string;
}

// self termination is only activated, if there is a COCALC_HUB_SELF_TERMINATE environment variable
// it's value is an interval in hours, minimum and maximum, for how long it should be alive
// and a drain period in minutes at the end.
// e.g. "24,48,15" for an uptime between 1 and 2 days and 15 minutes of draining
function init_self_terminate(): {
  startup: number;
  shutdown?: number; // when to shutdown (causes a failed health check)
  drain?: number; // when to start draining, causes a proxy server to no longer send traffic
} {
  const D = L.extend("init_self_terminate");
  const startup = Date.now();
  const conf = process.env.COCALC_HUB_SELF_TERMINATE;
  if (conf == null) {
    D("COCALC_HUB_SELF_TERMINATE env var not set, hence no self-termination");
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
  D("parsed data:", { from, to, drain_h });
  if (from > to)
    throw Error(
      "COCALC_HUB_SELF_TERMINATE 'from' must be smaller than 'to', e.g. '24,48,15'"
    );
  const uptime = Math.random() * (to - from); // hours
  const hours2ms = 1000 * 60 * 60;
  const shutdown = startup + (from + uptime) * hours2ms;
  const drain = shutdown - drain_h * hours2ms;
  if (startup > drain) {
    throw new Error(
      `COCALC_HUB_SELF_TERMINATE: startup must be smaller than drain – ${startup}>${drain}`
    );
  }
  D({
    startup: new Date(startup).toISOString(),
    drain: new Date(drain).toISOString(),
    shutdown: new Date(shutdown).toISOString(),
    uptime: seconds2hms((hours2ms * uptime) / 1000),
    draintime: seconds2hms((drain_h * hours2ms) / 1000),
  });
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
function setup_agent_check() {
  if (agent_port == 0 || drain == null) {
    L("setup_agent_check: agent_port not set, no agent checks");
    return;
  }

  // TODO this could also return a "weight" for this server, based on load values
  // there is also "drain", but we set it to "10%" to avoid a nasty situation, when all endpoints are draining.
  // ATTN: weight must be set as well, which is poorly documented here:
  // https://cbonte.github.io/haproxy-dconv/2.0/configuration.html#5.2-weight
  agent_check_server = createServer((c) => {
    let msg = Date.now() < drain ? "ready up 100%" : "10%";
    c.write(msg + "\r\n");
    c.destroy();
  });

  agent_check_server.listen(agent_port, agent_host);
  L(`setup_agent_check: listening on ${agent_host}:${agent_port}`);
}

export interface Check {
  status: string;
  abort?: boolean;
}

interface Opts {
  router: Router;
  db: PostgreSQL;
  extra?: (() => Promise<Check>)[]; // additional health checks
}

// this could be directly in setup_health_checks, but we also need it in proxy.coffee
// proxy.coffee must be rewritten and restructured first – just wrapping it with a router
// didn't work at all for me
export function process_alive(): HealthcheckData {
  let txt = "alive: YES";
  let is_dead = true;
  if (!database_is_working()) {
    // this will stop haproxy from routing traffic to us
    // until db connection starts working again.
    txt = "alive: NO – database not working";
  } else if (shutdown != null && Date.now() > shutdown) {
    txt = "alive: NO – shutdown initiated";
  } else {
    is_dead = false;
  }
  const code = is_dead ? 404 : 200;
  return { txt, code };
}

function check_concurrent(db: PostgreSQL): Check {
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

// same note as above for process_alive()
async function process_health_check(
  db: PostgreSQL,
  extra: (() => Promise<Check>)[] = []
): Promise<HealthcheckData> {
  let any_abort = false;
  let txt = "healthchecks:\n";
  for (const test of [() => check_concurrent(db), check_uptime, ...extra]) {
    const { status, abort } = await test();
    txt += `${status} – ${abort === true ? "FAIL" : "OK"}\n`;
    any_abort = any_abort || abort === true;
  }
  const code = any_abort ? 404 : 200;
  return { code, txt };
}

export async function setup_health_checks(opts: Opts): Promise<void> {
  const { router, db, extra } = opts;
  setup_agent_check();

  // used by HAPROXY for testing that this hub is OK to receive traffic
  router.get("/alive", (_, res: Response) => {
    const { code, txt } = process_alive();
    res.type("txt");
    res.status(code);
    res.send(txt);
  });

  // this is a more general check than concurrent-warn
  // additionally to checking the database condition, it also self-terminates
  // this hub if it is running for quite some time. beyond that, in the future
  // there could be even more checks on top of that.
  router.get("/healthcheck", async (_, res: Response) => {
    const { txt, code } = await process_health_check(db, extra);
    res.status(code);
    res.type("txt");
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
