#!/usr/bin/env node

process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
console.log("API_SERVER=", process.env.API_SERVER);

const { manager } = require("../dist/lib");

const PROJECT_HOME = "/tmp/home";

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
    compute_server_id: process.env.COMPUTE_SERVER_ID,
    waitHomeFilesystemType:
      process.env.UNIONFS_UPPER && process.env.UNIONFS_LOWER
        ? "fuse.unionfs-fuse"
        : "fuse",
  });
  await M.init();
}

main();
