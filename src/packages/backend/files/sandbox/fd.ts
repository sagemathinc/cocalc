import exec, { type ExecOutput } from "./exec";
import { type FdOptions } from "@cocalc/conat/files/fs";
export { type FdOptions };

export default async function fd(
  path: string,
  { options, darwin, linux, pattern, timeout, maxSize }: FdOptions,
): Promise<ExecOutput> {
  if (path == null) {
    throw Error("path must be specified");
  }

  return await exec({
    cmd: "/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/bin/fd",
    cwd: path,
    positionalArgs: pattern ? [pattern] : [],
    options,
    darwin,
    linux,
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

  "--and": anyValue,

  "-l": true,
  "--list-details": true,

  "-p": true,
  "--full-path": true,

  "-0": true,
  "--print0": true,

  "--max-results": validateInt,

  "-1": true,

  "-q": true,
  "--quite": true,

  "--show-errors": true,

  "--strip-cwd-prefix": validateEnum(["never", "always", "auto"]),

  "--one-file-system": true,
  "--mount": true,
  "--xdev": true,

  "-h": true,
  "--help": true,

  "-V": true,
  "--version": true,

  "-d": validateInt,
  "--max-depth": validateInt,

  "--min-depth": validateInt,

  "--exact-depth": validateInt,

  "--prune": true,

  "--type": anyValue,

  "-e": anyValue,
  "--extension": anyValue,

  "-E": anyValue,
  "--exclude": anyValue,

  "--ignore-file": anyValue,

  "-c": validateEnum(["never", "always", "auto"]),
  "--color": validateEnum(["never", "always", "auto"]),

  "-S": anyValue,
  "--size": anyValue,

  "--changed-within": anyValue,
  "--changed-before": anyValue,

  "-o": anyValue,
  "--owner": anyValue,

  "--format": anyValue,
} as const;

function anyValue() {}

function validateEnum(allowed: string[]) {
  return (value: string) => {
    if (!allowed.includes(value)) {
      throw Error("invalid value");
    }
  };
}

function validateInt(value: string) {
  const count = parseInt(value);
  if (!isFinite(count)) {
    throw Error("argument must be a number");
  }
}
