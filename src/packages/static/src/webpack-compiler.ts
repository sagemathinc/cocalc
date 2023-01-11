import webpack from "webpack";
import getConfig from "./webpack.config";

export function webpackCompiler() {
  const config = getConfig({ middleware: true });
  return webpack(config);
}
