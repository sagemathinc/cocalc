/*

https://github.com/ouch-org/ouch

ouch stands for Obvious Unified Compression Helper.

The .tar.gz support in 'ouch' is excellent -- super fast and memory efficient,
since it is fully parallel.

*/

import exec, { type ExecOutput, validate } from "./exec";
import { type OuchOptions } from "@cocalc/conat/files/fs";
export { type OuchOptions };
import { ouch as ouchPath } from "./install";

export default async function ouch(
  args: string[],
  { timeout, options, cwd }: OuchOptions = {},
): Promise<ExecOutput> {
  const command = args[0];
  if (!commands.includes(command)) {
    throw Error(`first argument must be one of ${commands.join(", ")}`);
  }

  return await exec({
    cmd: ouchPath,
    cwd,
    positionalArgs: args.slice(1),
    safety: [command, "-y", "-q"],
    timeout,
    options,
    whitelist,
  });
}

const commands = ["compress", "c", "decompress", "d", "list", "l", "ls"];

const whitelist = {
  "-H": true,
  "--hidden": true,
  g: true,
  "--gitignore": true,
  "-f": validate.str,
  "--format": validate.str,
  "-p": validate.str,
  "--password": validate.str,
  "-h": true,
  "--help": true,
  "-V": true,
  "--version": true,
} as const;
