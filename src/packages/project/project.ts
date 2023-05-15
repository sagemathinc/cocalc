/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import daemonizeProcess from "daemonize-process";

import { init as initBugCounter } from "./bug-counter";
import initInfoJson from "./info-json";
import initKucalc from "./init-kucalc";
import { getOptions } from "./init-program";
import { cleanup as cleanupEnvironmentVariables } from "./project-setup";
import initPublicPaths from "./public-paths";
import initServers from "./servers/init";

const { init: initClient } = require("./client"); // import { Client } from "./client";

import { getLogger } from "./logger";
const winston = getLogger("project-main");

function checkEnvVariables() {
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
}

export async function main() {
  checkEnvVariables();
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
