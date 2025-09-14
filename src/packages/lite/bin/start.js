#!/usr/bin/env node

const { dirname, join } = require("path");

(async () => {
  process.env.PORT ??= await require("@cocalc/backend/get-port").default();
  process.env.DATA = join(process.env.HOME ?? process.cwd(), ".cocalc", "lite");

  // put path to special node binaries:
  const { bin } = require("@cocalc/backend/data");
  process.env.PATH = `${bin}:${dirname(process.execPath)}:${process.env.PATH}`;

  require("@cocalc/lite/main").main();
})();
