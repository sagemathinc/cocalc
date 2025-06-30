import "@cocalc/backend/conat/persist";
import { init, type Options } from "@cocalc/conat/core/server";

function main() {
  console.log("main");
  process.on("message", (opts) => {
    console.log("got message:", opts);
    init(opts as Options);
  });
}

main();
