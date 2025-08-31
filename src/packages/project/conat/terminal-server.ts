import { terminalServer } from "@cocalc/conat/project/terminal";
import { spawn } from "@lydell/node-pty";
import { getIdentity } from "./connection";

import { getLogger } from "@cocalc/project/logger";
const logger = getLogger("project:conat:terminal-server");

export function init(opts) {
  opts = getIdentity(opts);
  logger.debug("init", opts);
  terminalServer({ ...opts, spawn });
}
