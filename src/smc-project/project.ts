import * as daemonizeProcess from "daemonize-process";
import initProgram from "./init-program";
import initKucalc from "./init-kucalc";
const { init: initClient } = require("./client"); // import { Client } from "./client";
import initInfoJson from "./info-json";
import initServers from "./servers/init";
import initPublicPaths from "./public-paths";
import { getLogger } from "./logger";

const winston = getLogger("project-main");

async function main() {
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

  const options = initProgram(); // must run before anything else.
  if (options.daemon) {
    winston.info("daemonize the process");
    daemonizeProcess();
  }
  initKucalc();
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

main();
