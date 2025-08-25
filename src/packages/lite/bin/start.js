#!/usr/bin/env node

(async () => {
  process.env.PORT ??= await require("@cocalc/backend/get-port").default();
  const { join } = require("path");
  process.env.COCALC_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
  process.env.COMPUTE_SERVER_ID = "0";
  process.env.DATA = join(process.env.HOME ?? process.cwd(), ".cocalc", "lite");

  require("@cocalc/lite/main").main();
})();
