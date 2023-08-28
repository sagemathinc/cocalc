#!/usr/bin/env node

process.env.BASE_PATH = process.env.BASE_PATH ?? "/";
process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
process.env.API_BASE_PATH = process.env.API_BASE_PATH ?? "/";

if (!process.env.PROJECT_ID) {
  throw Error("set the PROJECT_ID environment variable");
}

if (!process.env.API_KEY) {
  throw Error("set the API_KEY environment variable");
}

if (!process.env.IPYNB_PATH) {
  throw Error("set the IPYNB_PATH environment variable");
}

const { mountProject, jupyter } = require("@cocalc/compute");
const { dir } = require("tmp-promise");

async function main() {
  const tmpDir = await dir({ unsafeCleanup: true });
  console.log(tmpDir.path);

  const exitHandler = async () => {
    console.log("cleaning up...");
    await unmount?.();
    await tmpDir?.cleanup();
    process.exit();
  };

  process.on("exit", exitHandler);
  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);

  const unmount = await mountProject({
    project_id: process.env.PROJECT_ID,
    path: tmpDir.path,
  });

  const kernel = await jupyter({
    project_id: process.env.PROJECT_ID,
    path: process.env.IPYNB_PATH,
    cwd: tmpDir.path,
  });
}

main();
