import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("podman");

// 30 minute timeout (?)
export default async function podman(args: string[], timeout = 30 * 60 * 1000) {
  logger.debug("podman ", args.join(" "));
  try {
    const x = await executeCode({
      verbose: false,
      command: "podman",
      args,
      err_on_exit: true,
      timeout,
    });
    logger.debug("podman returned ", x);
    return x;
  } catch (err) {
    logger.debug("podman run error: ", err);
    throw err;
  }
}
