import "@cocalc/backend/conat/persist";
import { init, type Options } from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";
import { addErrorListeners } from "@cocalc/server/metrics/error-listener";
import { loadConatConfiguration } from "../configuration";
import { getLogger } from "@cocalc/backend/logger";

async function main() {
  console.log("main");

  addErrorListeners();
  const configDone = loadConatConfiguration();
  process.on("message", async (opts: Options) => {
    const logger = getLogger(`start-cluster-node:${opts.id}`);
    const msg = [
      "starting server",
      {
        ...opts,
        systemAccountPassword: "•".repeat(
          opts.systemAccountPassword?.length ?? 0,
        ),
      },
    ];
    console.log(...msg);
    logger.debug(...msg);
    // config can start before init message, but must be finished before calling init
    // (that said, most config is via env variables and the above.)
    await configDone;
    init({ ...(opts as Options), getUser, isAllowed });
  });
}

main();
