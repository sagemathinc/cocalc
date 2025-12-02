#!/usr/bin/env node
// CoCalc Plus CLI entrypoint. Delegate to the Lite starter so we reuse
// the same runtime behavior while keeping packaging concerns in @cocalc/plus.
require("@cocalc/lite/bin/start");
