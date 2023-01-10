import webpack from "webpack";
import middleware from "webpack-dev-middleware";
import getConfig from "./webpack.config";

export function webpackMiddleware() {
  const config = getConfig({ middleware: true });
  const compiler = webpack(config);
  return middleware(compiler, {});
}
