//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

// This is the CoCalc Global HUB.  It runs as a daemon, sitting in the
// middle of the action, connected to potentially thousands of clients,
// many Sage sessions, and PostgreSQL database.

import TTLCache from "@isaacs/ttlcache";
import { callback } from "awaiting";
import blocked from "blocked";
import { spawn } from "child_process";
import { program as commander, Option } from "commander";
import basePath from "@cocalc/backend/base-path";
import {
  pghost as DEFAULT_DB_HOST,
  pgdatabase as DEFAULT_DB_NAME,
  pguser as DEFAULT_DB_USER,
} from "@cocalc/backend/data";
import { trimLogFileSize } from "@cocalc/backend/logger";
import port from "@cocalc/backend/port";
import { init_start_always_running_projects } from "@cocalc/database/postgres/always-running";
import { load_server_settings_from_env } from "@cocalc/database/settings/server-settings";
import { init_passport } from "@cocalc/server/hub/auth";
import { initialOnPremSetup } from "@cocalc/server/initial-onprem-setup";
import initHandleMentions from "@cocalc/server/mentions/handle";
import initMessageMaintenance from "@cocalc/server/messages/maintenance";
import initProjectControl, {
  COCALC_MODES,
} from "@cocalc/server/projects/control";
import initIdleTimeout from "@cocalc/server/projects/control/stop-idle-projects";
import initNewProjectPoolMaintenanceLoop from "@cocalc/server/projects/pool/maintain";
import initPurchasesMaintenanceLoop from "@cocalc/server/purchases/maintenance";
import initSalesloftMaintenance from "@cocalc/server/salesloft/init";
import { stripe_sync } from "@cocalc/server/stripe/sync";
import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import { getClients } from "./clients";
import { set_agent_endpoint } from "./health-checks";
import { start as startHubRegister } from "./hub_register";
import { getLogger } from "./logger";
import initDatabase, { database } from "./servers/database";
import initExpressApp from "./servers/express-app";
import {
  loadNatsConfiguration,
  initNatsDatabaseServer,
  initNatsChangefeedServer,
  initNatsTieredStorage,
  initNatsServer,
} from "@cocalc/server/nats";
import initHttpRedirect from "./servers/http-redirect";
import initPrimus from "./servers/primus";
import initVersionServer from "./servers/version";
import { initConatServer } from "@cocalc/server/nats/socketio";

const MetricsRecorder = require("./metrics-recorder"); // import * as MetricsRecorder from "./metrics-recorder";

// Logger tagged with 'hub' for this file.
const logger = getLogger("hub");

// program gets populated with the command line options below.
let program: { [option: string]: any } = {};
export { program };

// How frequently to register with the database that this hub is up and running,
// and also report number of connected clients.
const REGISTER_INTERVAL_S = 20;

// the jsmap of connected clients
const clients = getClients();

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
  await callback(MetricsRecorder.init, logger);
  return {
    metric_blocked: MetricsRecorder.new_counter(
      "blocked_ms_total",
      'accumulates the "blocked" time in the hub [ms]',
    ),
    uncaught_exception_total: MetricsRecorder.new_counter(
      "uncaught_exception_total",
      'counts "BUG"s',
    ),
  };
}

async function startServer(): Promise<void> {
  logger.info("start_server");

  logger.info(`basePath='${basePath}'`);
  logger.info(
    `database: name="${program.databaseName}" nodes="${program.databaseNodes}" user="${program.databaseUser}"`,
  );

  const { metric_blocked, uncaught_exception_total } = await initMetrics();

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
  const projectControl = initProjectControl(program.mode);
  // used for nextjs hot module reloading dev server
  process.env["COCALC_MODE"] = program.mode;

  if (program.mode != "kucalc" && program.websocketServer) {
    // We handle idle timeout of projects.
    // This can be disabled via COCALC_NO_IDLE_TIMEOUT.
    // This only uses the admin-configurable settings field of projects
    // in the database and isn't aware of licenses or upgrades.
    initIdleTimeout(projectControl);
  }

  // all configuration MUST load nats configuration.  This loads
  // credentials to use nats from the database, and is needed
  // by many things.
  await loadNatsConfiguration();

  if (program.natsServer) {
    await initNatsServer();
  }

  if (program.natsDatabaseServer) {
    await initNatsDatabaseServer();
  }
  if (program.natsChangefeedServer) {
    await initNatsChangefeedServer();
  }
  if (program.natsTieredStorage) {
    // currently there must be exactly ONE of these, running on the same
    // node as the nats-server.  E.g., for development it's just part of the server.
    await initNatsTieredStorage();
  }

  if (program.websocketServer) {
    // Initialize the version server -- must happen after updating schema
    // (for first ever run).
    await initVersionServer();

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

  const { router, httpServer } = await initExpressApp({
    isPersonal: program.personal,
    projectControl,
    proxyServer: !!program.proxyServer,
    nextServer: !!program.nextServer,
    cert: program.httpsCert,
    key: program.httpsKey,
    listenersHack:
      program.mode == "single-user" &&
      program.proxyServer &&
      program.nextServer &&
      program.websocketServer &&
      process.env["NODE_ENV"] == "development",
  });

  if (program.conatServer) {
    initConatServer({ httpServer });
  }

  //initNatsServer();

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

  if (program.websocketServer) {
    logger.info("initializing primus websocket server");
    initPrimus({
      httpServer,
      router,
      projectControl,
      clients,
      host: program.hostname,
      port,
      isPersonal: program.personal,
    });
  }

  if (program.websocketServer || program.proxyServer || program.nextServer) {
    logger.info(
      "Starting registering periodically with the database and updating a health check...",
    );

    // register the hub with the database periodically, and
    // also confirms that database is working.
    await callback2(startHubRegister, {
      database,
      clients,
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

    if (
      program.websocketServer &&
      program.nextServer &&
      process.env["NODE_ENV"] != "production"
    ) {
      // This is mostly to deal with conflicts between both nextjs and webpack when doing
      // hot module reloading.  They fight with each other, and the we -- the developers --
      // win only AFTER the fight is done. So we force the fight automatically, rather than
      // manually, which is confusing.
      // It also allows us to ensure super insanely slow nextjs is built.
      console.log(
        `launch get of ${target} so that webpack and nextjs websockets can fight things out`,
      );
      const childProcess = spawn(
        "chromium-browser",
        ["--no-sandbox", "--headless", target],
        { detached: true, stdio: "ignore" },
      );
      childProcess.unref();

      // Schedule the process to be killed after 120 seconds (120,000 milliseconds)
      setTimeout(() => {
        if (childProcess.pid) {
          try {
            process.kill(-childProcess.pid, "SIGKILL");
          } catch (_err) {}
        }
      }, 120000);
    }
  }

  if (program.all || program.mentions) {
    // kucalc: for now we just have the hub-mentions servers
    // do the new project pool maintenance, since there is only
    // one hub-stats.
    // On non-cocalc it'll get done by *the* hub because of program.all.
    initNewProjectPoolMaintenanceLoop();
    // Starts periodic maintenance on pay-as-you-go purchases, e.g., quota
    // upgrades of projects.
    initPurchasesMaintenanceLoop();
    initSalesloftMaintenance();
    setInterval(trimLogFileSize, 1000 * 60 * 3);
  }

  addErrorListeners(uncaught_exception_total);
}

// addErrorListeners: after successful startup, don't crash on routine errors.
// We don't do this until startup, since we do want to crash on errors on startup.

// Use cache to not save the SAME error to the database (and prometheus)
// more than once per minute.
const errorReportCache = new TTLCache({ ttl: 60 * 1000 });

function addErrorListeners(uncaught_exception_total) {
  process.addListener("uncaughtException", function (err) {
    logger.error(
      "BUG ****************************************************************************",
    );
    logger.error("Uncaught exception: " + err);
    console.error(err.stack);
    logger.error(err.stack);
    logger.error(
      "BUG ****************************************************************************",
    );
    const key = `${err}`;
    if (errorReportCache.has(key)) {
      return;
    }
    errorReportCache.set(key, true);
    database?.uncaught_exception(err);
    uncaught_exception_total.inc(1);
  });

  return process.on("unhandledRejection", function (reason, p) {
    logger.error(
      "BUG UNHANDLED REJECTION *********************************************************",
    );
    console.error(p, reason); // strangely sometimes logger.error can't actually show the traceback...
    logger.error("Unhandled Rejection at:", p, "reason:", reason);
    logger.error(
      "BUG UNHANDLED REJECTION *********************************************************",
    );
    const key = `${p}${reason}`;
    if (errorReportCache.has(key)) {
      return;
    }
    errorReportCache.set(key, true);
    database?.uncaught_exception(reason);
    uncaught_exception_total.inc(1);
  });
}

//############################################
// Process command line arguments
//############################################
async function main(): Promise<void> {
  commander
    .name("cocalc-hub-server")
    .usage("options")
    .addOption(
      new Option(
        "--mode [string]",
        `REQUIRED mode in which to run CoCalc (${COCALC_MODES.join(
          ", ",
        )}) - or set COCALC_MODE env var`,
      ).choices(COCALC_MODES as any as string[]),
    )
    .option(
      "--all",
      "runs all of the servers: websocket, proxy, next (so you don't have to pass all those opts separately), and also mentions updator and updates db schema on startup; use this in situations where there is a single hub that serves everything (instead of a microservice situation like kucalc)",
    )
    .option("--websocket-server", "run a websocket server in this process")
    .option(
      "--nats-server",
      "run a hub that serves standard nats microservices, e.g., LLM's, authentication, etc.  There should be at least one of these.",
    )
    .option(
      "--conat-server",
      "run a hub that provides a single-core conat server (socketio) as part of its http server. This is needed for dev and small deployments of cocalc.",
    )
    .option(
      "--nats-database-server",
      "run NATS microservice to provide access (including changefeeds) to the database",
    )
    .option(
      "--nats-changefeed-server",
      "run NATS microservice to provide postgres based changefeeds; there must be AT LEAST one of these.",
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
      "port for HAProxy agent-check (default: 0 -- do not start)",
      (n) => parseInt(n),
      0,
    )
    .option(
      "--hostname [string]",
      'host of interface to bind to (default: "127.0.0.1")',
      "127.0.0.1",
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
      "be very unhappy if number of concurrent db requests exceeds this (default: 300)",
      (n) => parseInt(n),
      300,
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
        `the --mode option must be specified or the COCALC_MODE env var set to one of ${COCALC_MODES.join(
          ", ",
        )}`,
      );
      process.exit(1);
    }
  }
  if (program.all) {
    program.websocketServer =
      program.natsServer =
      program.natsChangefeedServer =
      program.natsTieredStorage =
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
