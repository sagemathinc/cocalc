import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("podman");

type PodmanOpts =
  | number
  | {
      timeout?: number;
      sudo?: boolean;
    };

// 30 minute timeout (?)
export default async function podman(args: string[], opts: PodmanOpts = {}) {
  const { timeout, sudo } =
    typeof opts === "number" ? { timeout: opts, sudo: false } : opts;
  logger.debug(`${sudo ? "sudo " : ""}podman `, args.join(" "));
  const command = sudo ? "sudo" : "podman";
  const cmdArgs = sudo ? ["podman", ...args] : args;
  try {
    const x = await executeCode({
      verbose: false,
      command,
      args: cmdArgs,
      err_on_exit: true,
      timeout: timeout ?? 30 * 60 * 1000,
    });
    logger.debug("podman returned ", x);
    return x;
  } catch (err) {
    logger.debug("podman run error: ", err);
    throw err;
  }
}
