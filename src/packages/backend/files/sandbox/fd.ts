import exec, { type ExecOutput, validate } from "./exec";
import { type FdOptions } from "@cocalc/conat/files/fs";
export { type FdOptions };
import { fd as fdPath } from "./install";

export default async function fd(
  path: string,
  { options, darwin, linux, pattern, timeout, maxSize }: FdOptions = {},
): Promise<ExecOutput> {
  if (path == null) {
    throw Error("path must be specified");
  }

  return await exec({
    cmd: fdPath,
    cwd: path,
    positionalArgs: pattern ? [pattern] : [],
    options,
    darwin,
    linux,
    safety: ["--no-follow"],
    maxSize,
    timeout,
    whitelist,
  });
}

const whitelist = {
  "-H": true,
  "--hidden": true,

  "-I": true,
  "--no-ignore": true,

  "-u": true,
  "--unrestricted": true,

  "--no-ignore-vcs": true,
  "--no-require-git": true,

  "-s": true,
  "--case-sensitive": true,

  "-i": true,
  "--ignore-case": true,

  "-g": true,
  "--glob": true,

  "--regex": true,

  "-F": true,
  "--fixed-strings": true,

  "--and": validate.str,

  "-l": true,
  "--list-details": true,

  "-p": true,
  "--full-path": true,

  "-0": true,
  "--print0": true,

  "--max-results": validate.int,

  "-1": true,

  "-q": true,
  "--quite": true,

  "--show-errors": true,

  "--strip-cwd-prefix": validate.set(["never", "always", "auto"]),

  "--one-file-system": true,
  "--mount": true,
  "--xdev": true,

  "-h": true,
  "--help": true,

  "-V": true,
  "--version": true,

  "-d": validate.int,
  "--max-depth": validate.int,

  "--min-depth": validate.int,

  "--exact-depth": validate.int,

  "--prune": true,

  "--type": validate.str,

  "-e": validate.str,
  "--extension": validate.str,

  "-E": validate.str,
  "--exclude": validate.str,

  "--ignore-file": validate.str,

  "-c": validate.set(["never", "always", "auto"]),
  "--color": validate.set(["never", "always", "auto"]),

  "-S": validate.str,
  "--size": validate.str,

  "--changed-within": validate.str,
  "--changed-before": validate.str,

  "-o": validate.str,
  "--owner": validate.str,

  "--format": validate.str,
} as const;
