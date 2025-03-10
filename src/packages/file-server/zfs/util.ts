import { executeCode } from "@cocalc/backend/execute-code";
import { context, DEFAULT_EXEC_TIMEOUT_MS } from "./config";
import { fatalError } from "./db";

export async function exec(opts) {
  try {
    return await executeCode({
      ...opts,
      timeout: DEFAULT_EXEC_TIMEOUT_MS / 1000,
    });
  } catch (err) {
    if (opts.what) {
      fatalError({
        ...opts.what,
        err,
        desc: `${opts.desc ? opts.desc : ""} "${opts.command} ${opts.args?.join(" ") ?? ""}"`,
      });
    }
    throw err;
  }
}

export async function initDataDir() {
  await executeCode({ command: "sudo", args: ["mkdir", "-p", context.DATA] });
  await executeCode({
    command: "sudo",
    args: ["chmod", "a+rxw", context.DATA],
  });
}
