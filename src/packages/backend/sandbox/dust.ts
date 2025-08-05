import exec, { type ExecOutput, validate } from "./exec";
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
  "-d": validate.int,
  "--depth": validate.int,

  "-n": validate.int,
  "--number-of-lines": validate.int,

  "-p": true,
  "--full-paths": true,

  "-X": validate.str,
  "--ignore-directory": validate.str,

  "-x": true,
  "--limit-filesystem": true,

  "-s": true,
  "--apparent-size": true,

  "-r": true,
  "--reverse": true,

  "-c": true,
  "--no-colors": true,
  "-C": true,
  "--force-colors": true,

  "-b": true,
  "--no-percent-bars": true,

  "-B": true,
  "--bars-on-right": true,

  "-z": validate.str,
  "--min-size": validate.str,

  "-R": true,
  "--screen-reader": true,

  "--skip-total": true,

  "-f": true,
  "--filecount": true,

  "-i": true,
  "--ignore-hidden": true,

  "-v": validate.str,
  "--invert-filter": validate.str,

  "-e": validate.str,
  "--filter": validate.str,

  "-t": validate.str,
  "--file-types": validate.str,

  "-w": validate.int,
  "--terminal-width": validate.int,

  "-P": true,
  "--no-progress": true,

  "--print-errors": true,

  "-D": true,
  "--only-dir": true,

  "-F": true,
  "--only-file": true,

  "-o": validate.str,
  "--output-format": validate.str,

  "-j": true,
  "--output-json": true,

  "-M": validate.str,
  "--mtime": validate.str,

  "-A": validate.str,
  "--atime": validate.str,

  "-y": validate.str,
  "--ctime": validate.str,

  "--collapse": validate.str,

  "-m": validate.set(["a", "c", "m"]),
  "--filetime": validate.set(["a", "c", "m"]),

  "-h": true,
  "--help": true,
  "-V": true,
  "--version": true,
} as const;
