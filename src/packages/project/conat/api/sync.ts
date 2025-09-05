export async function close(path: string) {
  console.log("TODO: close path", { path });
}

import exec, { type ExecOutput } from "@cocalc/backend/sandbox/exec";
import which from "which";

export async function mutagen(args: string[]): Promise<ExecOutput> {
  return await exec({
    cmd: await which("mutagen"),
    safety: args,
    env: { HOME: process.env.HOME ?? "" },
  });
}
