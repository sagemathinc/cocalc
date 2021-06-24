//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

// This is the CoCalc Global HUB.  It runs as a daemon, sitting in the
// middle of the action, connected to potentially thousands of clients,
// many Sage sessions, and PostgreSQL database.

import * as blocked from "blocked";
import { program as commander } from "commander";
import { callback2 } from "smc-util/async-utils";
import { callback } from "awaiting";

import { getLogger } from "./logger";
import { init as initMemory } from "smc-util-node/memory";
import port from "smc-util-node/port";
const { execute_code } = require("smc-util-node/misc_node"); // import { execute_code } from "smc-util-node/misc_node";
import { retry_until_success } from "smc-util/async-utils";
const { COOKIE_OPTIONS } = require("./client"); // import { COOKIE_OPTIONS } from "./client";
import { init_passport } from "./auth";
import base_path from "smc-util-node/base-path";
import { migrate_account_token } from "./postgres/migrate-account-token";
import { init_start_always_running_projects } from "./postgres/always-running";
import { set_agent_endpoint } from "./healthchecks";
import { handle_mentions_loop } from "./mentions/handle";
const MetricsRecorder = require("./metrics-recorder"); // import * as MetricsRecorder from "./metrics-recorder";
const { init_express_http_server } = require("./hub_http_server"); // import { init_express_http_server } from "./hub_http_server";
import { start as startHubRegister } from "./hub_register";
const initZendesk = require("./support").init_support; // import { init_support as initZendesk } from "./support";
import { getClients } from "./clients";
import { stripe_sync } from "./stripe/sync";
import { init_stripe } from "./stripe";
import { projects } from "smc-util-node/data";

import { database } from "./servers/database";
import initDatabase from "./servers/database";
import initProjectControl from "./servers/project-control";
import initVersionServer from "./servers/version";
import initPrimus from "./servers/primus";
import initShareServer from "./servers/share";
import initProxy from "./proxy";

// Logger tagged with 'hub' for this file.
const winston = getLogger("hub");

// program gets populated with the command line options below.
let program: { [option: string]: any } = {};

// How frequently to register with the database that this hub is up and running,
// and also report number of connected clients.
const REGISTER_INTERVAL_S = 20;

// the jsmap of connected clients
const clients = getClients();

async function reset_password(email_address: string): Promise<void> {
  try {
    await callback2(database.reset_password, { email_address });
    winston.info(`Password changed for ${email_address}`);
  } catch (err) {
    winston.info(`Error resetting password -- ${err}`);
  }
}

async function startLandingService(): Promise<void> {
  // This @cocalc/landing is a private npm package that is
  // installed on https://cocalc.com only.  Hence we use require,
  // since it need not be here.
  // TODO: can we do `await import(...)?`
  const { LandingServer } = require("@cocalc/landing");
  const { uncaught_exception_total } = await initMetrics();
  const landing_server = new LandingServer({ db: database });
  await landing_server.start();

  addErrorListeners(uncaught_exception_total);
}

// This calculates and updates the statistics for the /stats endpoint.
// It's important that we call this periodically, because otherwise the /stats data is outdated.
async function init_update_stats(): Promise<void> {
  winston.info("init updating stats periodically");
  const update = () => callback2(database.get_stats);
  // Do it every minute:
  setInterval(() => update(), 60000);
  // Also do it once now:
  await update();
}

// This calculates and updates the site_license_usage_log.
// It's important that we call this periodically, if we want
// to be able to monitor site license usage. This is enabled
// by default only for dev mode (so for development).
async function init_update_site_license_usage_log() {
  winston.info("init updating site license usage log periodically");
  const update = async () => await database.update_site_license_usage_log();
  setInterval(update, 31000);
  await update();
}

async function initMetrics() {
  winston.info("Initializing Metrics Recorder...");
  await callback(MetricsRecorder.init, winston);
  return {
    metric_blocked: MetricsRecorder.new_counter(
      "blocked_ms_total",
      'accumulates the "blocked" time in the hub [ms]'
    ),
    uncaught_exception_total: MetricsRecorder.new_counter(
      "uncaught_exception_total",
      'counts "BUG"s'
    ),
  };
}

async function startServer(): Promise<void> {
  winston.info("start_server");
  winston.info(`dev = ${program.dev}`);

  // Be very sure cookies do NOT work unless over https.  IMPORTANT.
  if (!COOKIE_OPTIONS.secure) {
    throw Error("client cookie options are not secure");
  }

  winston.info(`base_path='${base_path}'`);
  winston.info(
    `using database "${program.keyspace}" and database-nodes="${program.databaseNodes}"`
  );

  const { metric_blocked, uncaught_exception_total } = await initMetrics();

  // Log anything that blocks the CPU for more than 10ms -- see https://github.com/tj/node-blocked
  blocked((ms: number) => {
    if (ms > 0) {
      metric_blocked.inc(ms);
    }
    // record that something blocked:
    winston.debug(`BLOCKED for ${ms}ms`);
  });

  // Log heap memory usage info
  initMemory(winston.debug);

  // Wait for database connection to work
  await retry_until_success({
    f: async () => await callback2(database.connect),
    start_delay: 1000,
    max_delay: 10000,
  });
  winston.info("connected to database.");

  if (
    program.websocketServer &&
    !database.is_standby &&
    (program.dev || program.update)
  ) {
    winston.info("Update database schema");
    await callback2(database.update_schema);
  }

  // Initial the version server -- must happen after updating schema (for first ever run).
  await initVersionServer();

  // setting port must come before the hub_http_server.init_express_http_server below
  if (program.agentPort) {
    winston.info("Configure agent port");
    set_agent_endpoint(program.agentPort, program.host);
  }

  // Handle potentially ancient cocalc installs with old account registration token.
  winston.info("Check for all account registration token");
  await migrate_account_token(database);

  // Mentions
  if (program.mentions) {
    winston.info("enabling handling of mentions...");
    handle_mentions_loop(database);
  }

  // Project control (aka "compute server")
  winston.info("initializing compute server...");
  const projectControl = await initProjectControl(program);

  if (program.websocketServer) {
    // Stripe
    winston.info("initializing stripe support...");
    await init_stripe(database, winston);

    // Zendesk
    winston.info("initializing zendesk support...");
    await callback(initZendesk);

    if (program.dev && process.env.USER == "user") {
      // Definitely in dev mode, probably on cocalc.com, so we kill
      // all the running projects when starting the hub:
      // Whenever we start the dev server, we just assume
      // all projects are stopped, since assuming they are
      // running when they are not is bad.  Something similar
      // is done in cocalc-docker.
      winston.info("killing all projects...");
      await execute_code({
        // in the scripts/ path...
        command: "cocalc_kill_all_dev_projects.py",
      });

      await callback2(database._query, {
        safety_check: false,
        query: 'update projects set state=\'{"state":"opened"}\'',
      });

      // Also, unrelated to killing projects, for purposes of developing
      // custom software images, we inject a couple of random nonsense entries
      // into the table in the DB:
      winston.info("inserting random nonsense compute images in database");
      await callback2(database.insert_random_compute_images);
    }
  }

  if (program.dev || program.single) {
    await init_update_stats();
  }

  if (program.dev) {
    await init_update_site_license_usage_log();
  }

  if (program.dev || program.single || program.kubernetes) {
    // This is async but runs forever, so don't wait for it.  (TODO: seems dumb)
    winston.info("init starting always running projects");
    init_start_always_running_projects(database);
  }

  // We always create the express HTTP server, since the other servers
  // (websocket, proxy, and share) are attached to this.
  winston.info("creating express http server");
  const { http_server, express_router, express_app } =
    await init_express_http_server({
      dev: program.dev,
      is_personal: program.personal,
      compute_server: projectControl,
      database,
      cookie_options: COOKIE_OPTIONS,
    });

  winston.info(
    `starting express webserver listening on ${program.host}:${port}`
  );
  await callback(http_server.listen.bind(http_server), port, program.host);

  if (program.shareServer) {
    winston.info("initialize the share server");
    initShareServer(express_app, program.sharePath);
    winston.info("finished initializing the share server");
  }

  if (program.websocketServer && !database.is_standby) {
    await callback2(init_passport, {
      router: express_router,
      database,
      host: program.host,
    });
  }

  if (program.websocketServer && !database.isStandby) {
    winston.info("initializing primus websocket server");
    initPrimus({
      http_server,
      express_router,
      compute_server: projectControl,
      clients,
      host: program.host,
      isPersonal: program.personal,
    });
  }

  if (program.proxyServer) {
    winston.info(`initializing the http proxy server on port ${port}`);
    initProxyServer({
      projectControl,
      isPersonal: program.personal,
      http_server,
      express_app,
    });
  }

  if (program.websocketServer || program.proxyServer || program.shareServer) {
    winston.info(
      "Starting registering periodically with the database and updating a health check..."
    );

    // register the hub with the database periodically, and
    // also confirms that database is working.
    await callback2(startHubRegister, {
      database,
      clients,
      host: program.host,
      port,
      interval_s: REGISTER_INTERVAL_S,
    });

    winston.info(
      `Started hub. HTTP port ${program.port}; keyspace ${program.keyspace}`
    );
  }

  addErrorListeners(uncaught_exception_total);
}

// addErrorListeners: after successful startup, don't crash on routine errors.
// We don't do this until startup, since we do want to crash on errors on startup.
// TODO: could alternatively be handled via winston (?).
function addErrorListeners(uncaught_exception_total) {
  process.addListener("uncaughtException", function (err) {
    winston.error(
      "BUG ****************************************************************************"
    );
    winston.error("Uncaught exception: " + err);
    console.error(err.stack);
    winston.error(err.stack);
    winston.error(
      "BUG ****************************************************************************"
    );
    database?.uncaught_exception(err);
    uncaught_exception_total.inc(1);
  });

  return process.on("unhandledRejection", function (reason, p) {
    winston.error(
      "BUG UNHANDLED REJECTION *********************************************************"
    );
    console.error(p, reason); // strangely sometimes winston.error can't actually show the traceback...
    winston.error("Unhandled Rejection at:", p, "reason:", reason);
    winston.error(
      "BUG UNHANDLED REJECTION *********************************************************"
    );
    database?.uncaught_exception(p);
    uncaught_exception_total.inc(1);
  });
}

//############################################
// Process command line arguments
//############################################
async function main(): Promise<void> {
  const default_db = process.env.PGHOST ?? "localhost";

  commander
    .option(
      "--dev",
      "if given, then run in VERY UNSAFE single-user dev mode; sets most servers enabled"
    )
    .option("--websocket-server", "run the websocket server")
    .option("--proxy-server", "run the proxy server")
    .option("--share-server", "run the share server")
    .option(
      "--landing-server",
      "run the closed source landing pages server (requires @cocalc/landing installed)"
    )
    .option(
      "--share-path [string]",
      `describes where the share server finds shared files for each project at (default: ${projects}/[project_id])`,
      `${projects}/[project_id]`
    )
    .option(
      "--agent-port <n>",
      "port for HAProxy agent-check (default: 0 -- do not start)",
      (n) => parseInt(n),
      0
    )
    .option(
      "--host [string]",
      'host of interface to bind to (default: "127.0.0.1")',
      "127.0.0.1"
    )
    .option(
      "--database-nodes <string,string,...>",
      `database address (default: '${default_db}')`,
      default_db
    )
    .option(
      "--keyspace [string]",
      'Database name to use (default: "smc")',
      "smc"
    )
    .option("--passwd [email_address]", "Reset password of given user", "")
    .option(
      "--update",
      "Update schema and primus on startup (always true for --dev; otherwise, false)"
    )
    .option(
      "--stripe-sync",
      "Sync stripe subscriptions to database for all users with stripe id",
      "yes"
    )
    .option(
      "--update-stats",
      "Calculates the statistics for the /stats endpoint and stores them in the database",
      "yes"
    )
    .option("--delete-expired", "Delete expired data from the database", "yes")
    .option(
      "--blob-maintenance",
      "Do blob-related maintenance (dump to tarballs, offload to gcloud)",
      "yes"
    )
    .option(
      "--local",
      "If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)"
    )
    .option(
      "--kucalc",
      "if given, assume running in the KuCalc kubernetes environment"
    )
    .option("--mentions", "if given, periodically handle mentions")
    .option(
      "--test",
      "terminate after setting up the hub -- used to test if it starts up properly"
    )
    .option("--single", "if given, then run in LESS SAFE single-machine mode")
    .option(
      "--kubernetes",
      "if given, then run in mode for cocalc-kubernetes (monolithic but in Kubernetes)"
    )
    .option(
      "--db-concurrent-warn <n>",
      "be very unhappy if number of concurrent db requests exceeds this (default: 300)",
      (n) => parseInt(n),
      300
    )
    .option(
      "--personal",
      "run in VERY UNSAFE personal mode; there is only one user and no authentication"
    )
    .parse(process.argv);
  // Everywhere else in our code, we just refer to program.[options] since we
  // wrote this code against an ancient version of commander.
  const opts = commander.opts();
  for (const name in opts) {
    program[name] = opts[name];
  }

  try {
    // Everything we do here requires the database to be initialized. Once
    // this is called, require('./postgres/database').default() is a valid db
    // instance that can be used.
    initDatabase({
      host: program.databaseNodes,
      database: program.keyspace,
      concurrent_warn: program.dbConcurrentWarn,
    });

    if (program.dev) {
      // dev implies numerous other options
      program.websocketServer = true;
      program.shareServer = true;
      program.proxyServer = true;
      program.mentions = true;
    }

    if (program.passwd) {
      winston.debug("Resetting password");
      await reset_password(program.passwd);
      process.exit();
    } else if (program.stripeSync) {
      winston.debug("Stripe sync");
      await stripe_sync({ database, logger: winston });
      process.exit();
    } else if (program.deleteExpired) {
      await callback2(database.delete_expired, {
        count_only: false,
      });
      process.exit();
    } else if (program.blobMaintenance) {
      await callback2(database.blob_maintenance);
      process.exit();
    } else if (program.updateStats) {
      await callback2(database.get_stats);
      process.exit();
    } else if (program.landing) {
      console.log("LANDING PAGE MODE");
      await startLandingService();
    } else {
      await startServer();
    }
  } catch (err) {
    console.log(err);
    winston.error("Error -- ", err);
    process.exit(1);
  }
}

main();
