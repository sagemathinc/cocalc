/*
Plugin to support hot module loading.

NOTE: We use analyzerMode="static" to get a static file (dist/report.html)
instead of running a webserver, which gets complicated in some environments.
*/

import { HotModuleReplacementPlugin } from "webpack";

import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";

export default function hotModuleReplacementPlugin(registerPlugin) {
  registerPlugin(
    "HotModuleReplacementPlugin -- don't have to refresh when things change",
    new HotModuleReplacementPlugin()
  );
  registerPlugin(
    "ReactRefreshWebpackPlugin -- don't have to refresh when react things change",
    new ReactRefreshWebpackPlugin({ library:'hmr', overlay: { sockIntegration: "whm" } })
  );
}
