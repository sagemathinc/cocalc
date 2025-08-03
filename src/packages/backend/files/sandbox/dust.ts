import exec, { type ExecOutput /* validate */ } from "./exec";
import { type DustOptions } from "@cocalc/conat/files/fs";
export { type DustOptions };
import { dust as dustPath } from "./install";

export default async function dust(
  path: string,
  { options, darwin, linux, timeout, maxSize }: DustOptions = {},
): Promise<ExecOutput> {
  if (path == null) {
    throw Error("path must be specified");
  }

  return await exec({
    cmd: dustPath,
    cwd: path,
    positionalArgs: [path],
    options,
    darwin,
    linux,
    maxSize,
    timeout,
    whitelist,
  });
}

const whitelist = {
  "-j": true,
} as const;
