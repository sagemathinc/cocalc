/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import daemonizeProcess from "daemonize-process";

import { init as initBugCounter } from "./bug-counter";
import { init as initClient, initDEBUG } from "./client";
import initInfoJson from "./info-json";
import initKucalc from "./init-kucalc";
import { getOptions } from "./init-program";
import { cleanup as cleanupEnvironmentVariables } from "./project-setup";
import initPublicPaths from "./public-paths";
import initServers from "./servers/init";

import { getLogger } from "./logger";
const logger = getLogger("project-main");

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
  initBugCounter();
  checkEnvVariables();
  const options = getOptions();
  if (options.daemon) {
    logger.info("daemonize the process");
    daemonizeProcess();
  }
  cleanupEnvironmentVariables();
  initKucalc(); // must be after cleanupEnvironmentVariables, since this *adds* custom environment variables.
  logger.info("main init function");
  logger.info("initialize INFO.json file");
  await initInfoJson();
  logger.info("create Client interface");
  initClient();
  logger.info("create all the servers...");
  await initServers();
  logger.info("create public paths watcher...");
  initPublicPaths();
  initDEBUG();
}
