/*
Plugin to support hot module loading.

NOTE: We use analyzerMode="static" to get a static file (dist/report.html)
instead of running a webserver, which gets complicated in some environments.
*/

import basePath from "@cocalc/backend/base-path";
import { HotModuleReplacementPlugin } from "webpack";
import { join } from "path";

import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";

export default function hotModuleReplacementPlugin(registerPlugin) {
  registerPlugin(
    "HotModuleReplacementPlugin -- don't have to refresh when things change",
    new HotModuleReplacementPlugin()
  );
  registerPlugin(
    "ReactRefreshWebpackPlugin -- don't have to refresh when react things change",
    new ReactRefreshWebpackPlugin({
      library: "hmr",
      overlay: { sockIntegration: "whm" },
    })
  );
}

// See https://github.com/webpack-contrib/webpack-hot-middleware
export function getHotMiddlewareUrl() {
  return `webpack-hot-middleware/client?path=${join(
    basePath,
    "/static/__webpack_hmr"
  )}`;
}
