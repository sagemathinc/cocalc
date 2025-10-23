//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

// This is the CoCalc Global HUB.  It runs as a daemon, sitting in the
// middle of the action, connected to potentially thousands of clients,
// many Sage sessions, and PostgreSQL database.

import { callback } from "awaiting";
import blocked from "blocked";
import { spawn } from "child_process";
import { program as commander } from "commander";
import basePath from "@cocalc/backend/base-path";
import {
  pghost as DEFAULT_DB_HOST,
  pgdatabase as DEFAULT_DB_NAME,
  pguser as DEFAULT_DB_USER,
  pgConcurrentWarn as DEFAULT_DB_CONCURRENT_WARN,
  hubHostname as DEFAULT_HUB_HOSTNAME,
  agentPort as DEFAULT_AGENT_PORT,
} from "@cocalc/backend/data";
import { trimLogFileSize } from "@cocalc/backend/logger";
import port from "@cocalc/backend/port";
import { init_start_always_running_projects } from "@cocalc/database/postgres/always-running";
import { load_server_settings_from_env } from "@cocalc/database/settings/server-settings";
import { init_passport } from "@cocalc/server/hub/auth";
import { initialOnPremSetup } from "@cocalc/server/initial-onprem-setup";
import initHandleMentions from "@cocalc/server/mentions/handle";
import initMessageMaintenance from "@cocalc/server/messages/maintenance";
import initProjectControl from "@cocalc/server/projects/control";
import { start as startHubRegister } from "@cocalc/server/metrics/hub_register";
import initIdleTimeout from "@cocalc/server/projects/control/stop-idle-projects";
import initPurchasesMaintenanceLoop from "@cocalc/server/purchases/maintenance";
import initSalesloftMaintenance from "@cocalc/server/salesloft/init";
import { stripe_sync } from "@cocalc/server/stripe/sync";
import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import { set_agent_endpoint } from "./health-checks";
import { getLogger } from "./logger";
import initDatabase, { database } from "./servers/database";
import initExpressApp from "./servers/express-app";
import {
  loadConatConfiguration,
  initConatChangefeedServer,
  initConatApi,
  initConatPersist,
  initConatFileserver,
} from "@cocalc/server/conat";
import {
  initConatServer,
} from "@cocalc/server/conat/socketio";
import initHttpRedirect from "./servers/http-redirect";
import { addErrorListeners } from "@cocalc/server/metrics/error-listener";
import * as MetricsRecorder from "@cocalc/server/metrics/metrics-recorder";
import { migrateBookmarksToConat } from "./migrate-bookmarks";

// Logger tagged with 'hub' for this file.
const logger = getLogger("hub");

// program gets populated with the command line options below.
let program: { [option: string]: any } = {};
export { program };

const REGISTER_INTERVAL_S = 20;

async function reset_password(email_address: string): Promise<void> {
  try {
    await callback2(database.reset_password, { email_address });
    logger.info(`Password changed for ${email_address}`);
  } catch (err) {
    logger.info(`Error resetting password -- ${err}`);
  }
}

// This calculates and updates the statistics for the /stats endpoint.
// It's important that we call this periodically, because otherwise the /stats data is outdated.
async function init_update_stats(): Promise<void> {
  logger.info("init updating stats periodically");
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
  logger.info("init updating site license usage log periodically");
  const update = async () => await database.update_site_license_usage_log();
  setInterval(update, 31000);
  await update();
}

async function initMetrics() {
  logger.info("Initializing Metrics Recorder...");
  MetricsRecorder.init();
  return {
    metric_blocked: MetricsRecorder.new_counter(
      "blocked_ms_total",
      'accumulates the "blocked" time in the hub [ms]',
    ),
  };
}

async function startServer(): Promise<void> {
  logger.info("start_server");

  logger.info(`basePath='${basePath}'`);
  logger.info(
    `database: name="${program.databaseName}" nodes="${program.databaseNodes}" user="${program.databaseUser}"`,
  );

  const { metric_blocked } = await initMetrics();

  // Log anything that blocks the CPU for more than ~100ms -- see https://github.com/tj/node-blocked
  blocked((ms: number) => {
    if (ms > 100) {
      metric_blocked.inc(ms);
    }
    // record that something blocked:
    if (ms > 100) {
      logger.debug(`BLOCKED for ${ms}ms`);
    }
  });

  // Wait for database connection to work.  Everything requires this.
  await retry_until_success({
    f: async () => await callback2(database.connect),
    start_delay: 1000,
    max_delay: 10000,
  });
  logger.info("connected to database.");

  if (program.updateDatabaseSchema) {
    logger.info("Update database schema");
    await callback2(database.update_schema);

    // in those cases where we initialize the database upon startup
    // (essentially only relevant for kucalc's hub-websocket)
    if (program.mode === "kucalc") {
      // and for on-prem setups, also initialize the admin account, set a registration token, etc.
      await initialOnPremSetup(database);
    }
  }

  // set server settings based on environment variables
  await load_server_settings_from_env(database);

  if (program.agentPort) {
    logger.info("Configure agent port");
    set_agent_endpoint(program.agentPort, program.hostname);
  }

  // Mentions
  if (program.mentions) {
    logger.info("enabling handling of mentions...");
    initHandleMentions();
    logger.info("enabling handling of messaging...");
    initMessageMaintenance();
  }

  // Project control
  logger.info("initializing project control...");
  const projectControl = initProjectControl();
  // used for nextjs hot module reloading dev server
  process.env["COCALC_MODE"] = program.mode;

  if (program.mode != "kucalc" && program.conatServer) {
    // We handle idle timeout of projects.
    // This can be disabled via COCALC_NO_IDLE_TIMEOUT.
    // This only uses the admin-configurable settings field of projects
    // in the database and isn't aware of licenses or upgrades.
    initIdleTimeout(projectControl);
  }

  // This loads from the database credentials to use Conat.
  await loadConatConfiguration();

  if (program.conatRouter) {
    // launch standalone socketio websocket server (no http server)
    await initConatServer({ kucalc: program.mode == "kucalc" });
  }

  let projectProxyHandlersPromise;
  if (program.conatFileserver || program.conatServer) {
    // purposely do NOT await here, because initializing this
    // relies on conat being up and running, which relies on
    // http server created below!
    projectProxyHandlersPromise = initConatFileserver();
  } else {
    projectProxyHandlersPromise = null;
  }

  if (program.conatApi || program.conatServer) {
    await initConatApi();
    await initConatChangefeedServer();
  }

  if (program.conatPersist || program.conatServer) {
    await initConatPersist();
  }

  if (program.conatServer) {
    if (program.mode == "single-user" && process.env.USER == "user") {
      // Definitely in dev mode, probably on cocalc.com in a project, so we kill
      // all the running projects when starting the hub:
      // Whenever we start the dev server, we just assume
      // all projects are stopped, since assuming they are
      // running when they are not is bad.  Something similar
      // is done in cocalc-docker.
      logger.info("killing all projects...");
      await callback2(database._query, {
        safety_check: false,
        query: 'update projects set state=\'{"state":"opened"}\'',
      });
      await spawn("pkill", ["-f", "node_modules/.bin/cocalc-project"]);

      // Also, unrelated to killing projects, for purposes of developing
      // custom software images, we inject a couple of random nonsense entries
      // into the table in the DB:
      logger.info("inserting random nonsense compute images in database");
      await callback2(database.insert_random_compute_images);
    }

    if (program.mode != "kucalc") {
      await init_update_stats();
      await init_update_site_license_usage_log();
      // This is async but runs forever, so don't wait for it.
      logger.info("init starting always running projects");
      init_start_always_running_projects(database);
    }
  }

  if (
    program.conatServer ||
    program.proxyServer ||
    program.nextServer ||
    program.conatApi
  ) {
    const { router, httpServer } = await initExpressApp({
      isPersonal: program.personal,
      projectControl,
      conatServer: !!program.conatServer,
      proxyServer: true, // always
      projectProxyHandlersPromise,
      nextServer: !!program.nextServer,
      cert: program.httpsCert,
      key: program.httpsKey,
    });

    // The express app create via initExpressApp above **assumes** that init_passport is done
    // or complains a lot. This is obviously not really necessary, but we leave it for now.
    await callback2(init_passport, {
      router,
      database,
      host: program.hostname,
    });

    logger.info(`starting webserver listening on ${program.hostname}:${port}`);
    await callback(httpServer.listen.bind(httpServer), port, program.hostname);

    if (port == 443 && program.httpsCert && program.httpsKey) {
      // also start a redirect from port 80 to port 443.
      await initHttpRedirect(program.hostname);
    }

    logger.info(
      "Starting registering periodically with the database and updating a health check...",
    );

    // register the hub with the database periodically, and
    // also confirms that database is working.
    await callback2(startHubRegister, {
      database,
      host: program.hostname,
      port,
      interval_s: REGISTER_INTERVAL_S,
    });

    const protocol = program.httpsKey ? "https" : "http";
    const target = `${protocol}://${program.hostname}:${port}${basePath}`;

    const msg = `Started HUB!\n\n-----------\n\n The following URL *might* work: ${target}\n\n\nPORT=${port}\nBASE_PATH=${basePath}\nPROTOCOL=${protocol}\n\n${
      basePath.length <= 1
        ? ""
        : "If you are developing cocalc inside of cocalc, take the URL of the host cocalc\nand append " +
          basePath +
          " to it."
    }\n\n-----------\n\n`;
    logger.info(msg);
    console.log(msg);
  }

  if (program.all || program.mentions) {
    // kucalc: for now we just have the hub-mentions servers
    // do the new project pool maintenance, since there is only
    // one hub-stats.
    // On non-cocalc it'll get done by *the* hub because of program.all.
    // Starts periodic maintenance on pay-as-you-go purchases, e.g., quota
    // upgrades of projects.
    initPurchasesMaintenanceLoop();
    initSalesloftMaintenance();
    // Migrate bookmarks from database to conat (runs once at startup)
    migrateBookmarksToConat().catch((err) => {
      logger.error("Failed to migrate bookmarks to conat:", err);
    });
    setInterval(trimLogFileSize, 1000 * 60 * 3);
  }

  addErrorListeners();
}

//############################################
// Process command line arguments
//############################################
async function main(): Promise<void> {
  commander
    .name("cocalc-hub-server")
    .usage("options")
    .option(
      "--mode <string>",
      `REQUIRED mode in which to run CoCalc or set COCALC_MODE env var`,
      "",
    )
    .option(
      "--all",
      "runs all of the servers: websocket, proxy, next (so you don't have to pass all those opts separately), and also mentions updator and updates db schema on startup; use this in situations where there is a single hub that serves everything (instead of a microservice situation like kucalc)",
    )
    .option(
      "--conat-server",
      "run a hub that provides a single-core conat server (i.e., conat-router but integrated with the http server), api, and persistence, fileserver, along with an http server. This is for dev and small deployments of cocalc (and if given, do not bother with --conat-[core|api|persist] below.)",
    )
    .option(
      "--conat-router",
      "run a hub that provides the core conat communication layer server over a websocket (but not http server).",
    )
    .option(
      "--conat-fileserver",
      "run a hub that provides a fileserver conat service",
    )
    .option(
      "--conat-api",
      "run a hub that connect to conat-router and provides the standard conat API services, e.g., basic api, LLM's, changefeeds, http file upload/download, etc.  There must be at least one of these.   You can increase or decrease the number of these servers with no coordination needed.",
    )
    .option(
      "--conat-persist",
      "run a hub that connects to conat-router and provides persistence for streams (e.g., key for sync editing).  There must be at least one of these, and they need access to common shared disk to store sqlite files.  Only one server uses a given sqlite file at a time.  You can increase or decrease the number of these servers with no coordination needed.",
    )
    .option("--proxy-server", "run a proxy server in this process")
    .option(
      "--next-server",
      "run a nextjs server (landing pages, share server, etc.) in this process",
    )
    .option(
      "--https-key [string]",
      "serve over https.  argument should be a key filename (both https-key and https-cert must be specified)",
    )
    .option(
      "--https-cert [string]",
      "serve over https.  argument should be a cert filename (both https-key and https-cert must be specified)",
    )
    .option(
      "--agent-port <n>",
      `port for HAProxy agent-check (default: ${DEFAULT_AGENT_PORT}; 0 means "do not start")`,
      (n) => parseInt(n),
      DEFAULT_AGENT_PORT,
    )
    .option(
      "--hostname [string]",
      `host of interface to bind to (default: "${DEFAULT_HUB_HOSTNAME}")`,
      DEFAULT_HUB_HOSTNAME,
    )
    .option(
      "--database-nodes <string,string,...>",
      `database address (default: '${DEFAULT_DB_HOST}')`,
      DEFAULT_DB_HOST,
    )
    .option(
      "--database-name [string]",
      `Database name to use (default: "${DEFAULT_DB_NAME}")`,
      DEFAULT_DB_NAME,
    )
    .option(
      "--database-user [string]",
      `Database username to use (default: "${DEFAULT_DB_USER}")`,
      DEFAULT_DB_USER,
    )
    .option("--passwd [email_address]", "Reset password of given user", "")
    .option(
      "--update-database-schema",
      "If specified, updates database schema on startup (always happens when mode is not kucalc).",
    )
    .option(
      "--stripe-sync",
      "Sync stripe subscriptions to database for all users with stripe id",
      "yes",
    )
    .option(
      "--update-stats",
      "Calculates the statistics for the /stats endpoint and stores them in the database",
      "yes",
    )
    .option("--delete-expired", "Delete expired data from the database", "yes")
    .option(
      "--blob-maintenance",
      "Do blob-related maintenance (dump to tarballs, offload to gcloud)",
      "yes",
    )
    .option(
      "--mentions",
      "if given, periodically handle mentions; on kucalc there is only one of these.  It also managed the new project pool.  Maybe this should be renamed --singleton!",
    )
    .option(
      "--test",
      "terminate after setting up the hub -- used to test if it starts up properly",
    )
    .option(
      "--db-concurrent-warn <n>",
      `be very unhappy if number of concurrent db requests exceeds this (default: ${DEFAULT_DB_CONCURRENT_WARN})`,
      (n) => parseInt(n),
      DEFAULT_DB_CONCURRENT_WARN,
    )
    .option(
      "--personal",
      "run VERY UNSAFE: there is only one user and no authentication",
    )
    .parse(process.argv);
  // Everywhere else in our code, we just refer to program.[options] since we
  // wrote this code against an ancient version of commander.
  const opts = commander.opts();
  for (const name in opts) {
    program[name] = opts[name];
  }
  if (!program.mode) {
    program.mode = process.env.COCALC_MODE;
    if (!program.mode) {
      throw Error(
        `the --mode option must be specified or the COCALC_MODE env var`,
      );
      process.exit(1);
    }
  }
  if (program.all) {
    program.conatServer =
      program.proxyServer =
      program.nextServer =
      program.mentions =
      program.updateDatabaseSchema =
        true;
  }
  if (process.env.COCALC_DISABLE_NEXT) {
    program.nextServer = false;
  }

  //console.log("got opts", opts);

  try {
    // Everything we do here requires the database to be initialized. Once
    // this is called, require('@cocalc/database/postgres/database').default() is a valid db
    // instance that can be used.
    initDatabase({
      host: program.databaseNodes,
      database: program.databaseName,
      user: program.databaseUser,
      concurrent_warn: program.dbConcurrentWarn,
    });

    if (program.passwd) {
      logger.debug("Resetting password");
      await reset_password(program.passwd);
      process.exit();
    } else if (program.stripeSync) {
      logger.debug("Stripe sync");
      await stripe_sync({ database, logger: logger });
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
    } else {
      await startServer();
    }
  } catch (err) {
    console.log(err);
    logger.error("Error -- ", err);
    process.exit(1);
  }
}

main();
