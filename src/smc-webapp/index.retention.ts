import { render } from "./retention-app";
import { redux } from "./app-framework";

export function run(opts: { escape: () => Promise<void> }) {
  //  require("script-loader!primus/primus-engine.min.js");
  //  // this must come before anything that touches event handling, etc.
  //  require("../webapp-lib/webapp-error-reporter.coffee");
  //
  // (window as any).$ = (window as any).jQuery = require("jquery");
  // after this lib.js package, the real app starts loading
  // (window as any).smcLoadStatus("Starting main application ...");
  //
  //  require("./client_browser.coffee");
  // require("./set-version-cookie.js");

  render(redux, opts);

  // require("./last");
}
