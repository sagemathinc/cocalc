import daemonizeProcess from "daemonize-process";

import { init as initBugCounter } from "./bug-counter";
import initInfoJson from "./info-json";
import initKucalc from "./init-kucalc";
import { getOptions } from "./init-program";
import { getLogger } from "./logger";
import { cleanup as cleanupEnvironmentVariables } from "./project-setup";
import initPublicPaths from "./public-paths";
import initServers from "./servers/init";
const { init: initClient } = require("./client"); // import { Client } from "./client";

const winston = getLogger("project-main");

export async function main() {
  const { HOME } = process.env;
  if (HOME == null) {
    throw Error("HOME env var must be set");
  }
  process.chdir(HOME);

  if (process.env.DATA == null) {
    throw Error("DATA env var must be set");
  }
  // TODO: some code, e.g., smc_pyutil's cc-jupyter script, assumes
  // that SMC is defined still.
  process.env.SMC = process.env.DATA;

  const options = getOptions();
  if (options.daemon) {
    winston.info("daemonize the process");
    daemonizeProcess();
  }
  initBugCounter();
  cleanupEnvironmentVariables();
  initKucalc(); // must be after cleanupEnvironmentVariables, since this *adds* custom environment variables.
  winston.info("main init function");
  winston.info("initialize INFO.json file");
  await initInfoJson();
  winston.info("create Client interface");
  initClient();
  winston.info("create all the servers...");
  await initServers();
  winston.info("create public paths watcher...");
  initPublicPaths();
}
