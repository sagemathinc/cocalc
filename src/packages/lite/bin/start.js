#!/usr/bin/env node

(async () => {
  process.env.PORT ??= await require("@cocalc/backend/get-port").default();
  const { join } = require("path");
  process.env.DATA = join(process.env.HOME ?? process.cwd(), ".cocalc", "lite");

  require("@cocalc/lite/main").main();
})();
