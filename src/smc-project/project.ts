import initProgram from "./init-program";
import initKucalc from "./init-kucalc";
const { init: initClient } = require("./client"); // import { Client } from "./client";
import initInfoJson from "./info-json";
import initServers from "./servers/init";
import initPublicPaths from "./public-paths";
import { getLogger } from "./logger";

const winston = getLogger("project-main");

async function main() {
  initProgram(); // must run before anything else.
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
