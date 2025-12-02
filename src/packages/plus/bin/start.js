#!/usr/bin/env node
// CoCalc Plus CLI entrypoint. Delegates to the Lite starter so runtime
// behavior stays identical while packaging lives in @cocalc/plus.
try {
  require("@cocalc/lite/bin/start");
} catch (err) {
  console.error("cocalc-plus failed to start:", err);
  process.exitCode = 1;
}
