import { rspack } from "@rspack/core";
import getConfig from "./rspack.config";

export function rspackCompiler() {
  if (process.env.NO_RSPACK_DEV_SERVER) {
    return undefined;
  }
  const config = getConfig({ middleware: true });
  // TODO -- typing!
  return rspack(config as any);
}
