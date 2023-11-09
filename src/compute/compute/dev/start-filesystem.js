#!/usr/bin/env node

process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";

console.log("API_SERVER=", process.env.API_SERVER);

const { mountProject } = require("../dist/lib");

const PROJECT_HOME = process.env.PROJECT_HOME ?? "/tmp/home";
const EXCLUDE_FROM_SYNC = process.env.EXCLUDE_FROM_SYNC ?? "";

async function main() {
  let unmount = null;
  let kernel = null;
  let term = null;
  const exitHandler = async () => {
    console.log("cleaning up...");
    process.removeListener("exit", exitHandler);
    process.removeListener("SIGINT", exitHandler);
    process.removeListener("SIGTERM", exitHandler);
    await unmount?.();
    process.exit();
  };

  process.on("exit", exitHandler);
  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);

  const { apiKey } = require("@cocalc/backend/data");
  let unionfs;
  if (process.env.UNIONFS_UPPER && process.env.UNIONFS_LOWER) {
    unionfs = {
      lower: process.env.UNIONFS_LOWER,
      upper: process.env.UNIONFS_UPPER,
      waitLowerFilesystemType: "fuse",
    };
  } else {
    unionfs = undefined;
  }

  console.log("Mounting project", process.env.PROJECT_ID, "at", PROJECT_HOME);
  try {
    exports.fs = await mountProject({
      project_id: process.env.PROJECT_ID,
      path: PROJECT_HOME,
      options: { mountOptions: { allowOther: true, nonEmpty: true } },
      unionfs,
      exclude: ["scratch", "tmp"],
      readTrackingPath: process.env.READ_TRACKING_PATH,
      exclude: [".*"].concat(EXCLUDE_FROM_SYNC.split("|")),
    });
    unmount = exports.fs.unmount;
  } catch (err) {
    console.log("something went wrong ", err);
    exitHandler();
  }

  const info = () => {
    console.log("Success!");
    console.log(`Home directory is mounted at ${PROJECT_HOME}`);
    console.log("\nPress Control+C to exit.");
  };

  info();
}

main();
