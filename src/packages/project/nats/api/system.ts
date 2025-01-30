export async function ping() {
  return { now: Date.now() };
}

export async function terminate() {}

import { handleExecShellCode } from "@cocalc/project/exec_shell_code";
export { handleExecShellCode as exec };

export { realpath } from "@cocalc/project/browser-websocket/realpath";
