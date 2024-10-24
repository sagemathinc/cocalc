#!/usr/bin/env node

/*
To get an interactive console with access to the manager:

~/cocalc/src/compute/compute/dev$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> manager = require('./start-compute.js').manager

*/

process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
console.log("API_SERVER=", process.env.API_SERVER);

const { manager } = require("../dist/lib");

const PROJECT_HOME = process.env.PROJECT_HOME ?? "/tmp/home";
const PORT = process.env.PORT ?? 5004;
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const exitHandler = async () => {
    console.log("cleaning up...");
    process.removeListener("exit", exitHandler);
    process.removeListener("SIGINT", exitHandler);
    process.removeListener("SIGTERM", exitHandler);
    process.exit();
  };

  process.on("exit", exitHandler);
  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);

  const M = manager({
    home: PROJECT_HOME,
    project_id: process.env.PROJECT_ID,
    compute_server_id: parseInt(process.env.COMPUTE_SERVER_ID),
    waitHomeFilesystemType:
      process.env.UNIONFS_UPPER && process.env.UNIONFS_LOWER
        ? "fuse.unionfs-fuse"
        : "fuse",
    host: HOST,
    port: PORT,
  });
  exports.manager = M;
  await M.init();
}

main();
