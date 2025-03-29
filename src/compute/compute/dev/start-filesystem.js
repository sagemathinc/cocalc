#!/usr/bin/env node

process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
console.log("API_SERVER=", process.env.API_SERVER);
const PROJECT_HOME = process.env.PROJECT_HOME ?? "/tmp/home";
const project_id = process.env.PROJECT_ID;
process.env.COCALC_PROJECT_ID = project_id;
process.env.COCALC_USERNAME = project_id.replace(/-/g, "");
process.env.HOME = PROJECT_HOME;

console.log("API_SERVER=", process.env.API_SERVER);

const { mountProject } = require("../dist/lib");

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
  const exclude = [".*"].concat(
    EXCLUDE_FROM_SYNC ? EXCLUDE_FROM_SYNC.split("|") : [],
  );
  console.log("exclude = ", exclude);
  try {
    exports.fs = await mountProject({
      project_id: process.env.PROJECT_ID,
      path: PROJECT_HOME,
      // NOTE: allowOther is disabled by default on Ubuntu and we do not need it.
      options: { mountOptions: { allowOther: false, nonEmpty: true } },
      unionfs,
      readTrackingFile: process.env.READ_TRACKING_FILE,
      exclude,
      metadataFile: process.env.METADATA_FILE,
      syncIntervalMin: 60 * 5,
      syncIntervalMax: 60 * 15,
      cacheTimeout: 0, // websocketfs -- critical to not use its cache, which is very painful for cocalc, e.g., when making new files.
    });
    unmount = exports.fs.unmount;
  } catch (err) {
    console.trace("something went wrong ", err);
    exitHandler();
    return;
  }

  const info = () => {
    console.log("Success!");
    console.log(`Home directory is mounted at ${PROJECT_HOME}`);
    console.log("\nPress Control+C to exit.");
  };

  info();
}

main();
