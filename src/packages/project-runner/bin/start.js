#!/usr/bin/env node

const { init } = require("@cocalc/project-runner/run");

(async () => {
  console.log("Starting...");
  await init();
  console.log("CoCalc Project Runner ready");
})();
