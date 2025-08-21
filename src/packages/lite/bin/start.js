#!/usr/bin/env node

process.env.COCALC_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
process.env.COMPUTE_SERVER_ID = "0";
process.env.DATA = process.cwd();

require("@cocalc/lite/main").main();
