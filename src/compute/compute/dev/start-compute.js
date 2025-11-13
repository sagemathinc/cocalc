#!/usr/bin/env node

process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
console.log("API_SERVER=", process.env.API_SERVER);
const PROJECT_HOME = process.env.PROJECT_HOME ?? "/tmp/home";
const project_id = process.env.PROJECT_ID;
process.env.COCALC_PROJECT_ID = project_id;
process.env.COCALC_USERNAME = project_id.replace(/-/g, "");
process.env.HOME = PROJECT_HOME;

const { manager } = require("../dist/lib");

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
    waitHomeFilesystemType:
      process.env.UNIONFS_UPPER && process.env.UNIONFS_LOWER
        ? "fuse.unionfs-fuse"
        : "fuse",
  });
  exports.manager = M;
  await M.init();
}

main();
