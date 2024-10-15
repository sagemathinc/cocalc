import { rspack } from "@rspack/core";
import getConfig from "./rspack.config";

export function rspackCompiler() {
  const config = getConfig({ middleware: true });
  // TODO -- typing!
  return rspack(config as any);
}
