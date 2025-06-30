import "@cocalc/backend/conat/persist";
import { init, type Options } from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";

function main() {
  console.log("main");
  process.on("message", (opts: Options) => {
    console.log("starting server", {
      ...opts,
      systemAccountPassword: "•".repeat(
        opts.systemAccountPassword?.length ?? 0,
      ),
    });
    init({ ...(opts as Options), getUser, isAllowed });
  });
}

main();
