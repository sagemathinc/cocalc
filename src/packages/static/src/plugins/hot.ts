/*
Plugin to support hot module loading.

NOTE: We use analyzerMode="static" to get a static file (dist/report.html)
instead of running a webserver, which gets complicated in some environments.
*/

import basePath from "@cocalc/backend/base-path";
import { HotModuleReplacementPlugin } from "@rspack/core";
import { join } from "path";
import ReactRefreshPlugin from "@rspack/plugin-react-refresh";

export default function hotModuleReplacementPlugin(registerPlugin) {
  registerPlugin(
    "HotModuleReplacementPlugin -- don't have to refresh when things change",
    new HotModuleReplacementPlugin(),
  );
  // https://www.npmjs.com/package/@rspack/plugin-react-refresh
  registerPlugin(
    "ReactRefreshPlugin -- don't have to refresh when react changes",
    new ReactRefreshPlugin(),
  );
}

// rspack TODO: no way this works!

// See https://github.com/webpack-contrib/webpack-hot-middleware
export function getHotMiddlewareUrl() {
  return `webpack-hot-middleware/client?path=${join(
    basePath,
    "/static/__webpack_hmr",
  )}`;
}
