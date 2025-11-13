#!/usr/bin/env node

/*
This is to be place in /cocalc/src/packages/compute/ and run there.
Actually, it just needs @cocalc/compute to be require-able.
*/

process.env.BASE_PATH = process.env.BASE_PATH ?? "/";
process.env.API_SERVER = process.env.API_SERVER ?? "https://cocalc.com";
process.env.API_BASE_PATH = process.env.API_BASE_PATH ?? "/";

const { mountProject, jupyter } = require("@cocalc/compute");

const PROJECT_HOME = "/home/user";

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
  try {
    if (!process.env.PROJECT_ID) {
      throw Error("You must set the PROJECT_ID environment variable");
    }

    if (!apiKey) {
      throw Error("You must set the API_KEY environment variable");
    }
  } catch (err) {
    const help = () => {
      console.log(err.message);
      console.log(
        "See https://github.com/sagemathinc/cocalc-compute-docker#readme",
      );
    };
    help();
    setInterval(help, 5000);
    return;
  }

  console.log("Mounting project", process.env.PROJECT_ID, "at", PROJECT_HOME);
  try {
    unmount = await mountProject({
      project_id: process.env.PROJECT_ID,
      path: PROJECT_HOME,
    });

    if (process.env.IPYNB_PATH) {
      console.log("Connecting to", process.env.IPYNB_PATH);
      kernel = await jupyter({
        project_id: process.env.PROJECT_ID,
        path: process.env.IPYNB_PATH,
        cwd: PROJECT_HOME,
      });
    }
  } catch (err) {
    console.log("something went wrong ", err);
    exitHandler();
  }

  const info = () => {
    console.log("Success!");

    if (process.env.IPYNB_PATH) {
      console.log(
        `Your notebook ${process.env.IPYNB_PATH} should be running in this container.`,
      );
      console.log(
        `  ${process.env.API_SERVER}/projects/${process.env.PROJECT_ID}/files/${process.env.IPYNB_PATH}`,
      );
    }

    console.log(`Your home directory is mounted at ${PROJECT_HOME}`);
    console.log("\nPress Control+C to exit.");
  };

  info();
}

main();
