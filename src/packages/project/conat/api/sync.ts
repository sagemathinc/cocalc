export async function close(path: string) {
  console.log("TODO: close path", { path });
}

import exec, { type ExecOutput } from "@cocalc/backend/sandbox/exec";
import which from "which";
import { dirname } from "path";

export async function mutagen(args: string[]): Promise<ExecOutput> {
  return await exec({
    cmd: await which("mutagen"),
    safety: args,
    // ssh needed in some cases --
    env: { HOME: process.env.HOME ?? "", PATH: dirname(await which("ssh")) },
  });
}
