/*

NOTE: fd is a very fast parallel rust program for finding files matching
a pattern.  It is complementary to find here though, because we mainly
use find to compute directory
listing info (e.g., file size, mtime, etc.), and fd does NOT do that; it can
exec ls, but that is slower than using find.  So both find and fd are useful
for different tasks -- find is *better* for directory listings and fd is better
for finding filesnames in a directory tree that match a pattern.
*/

import type { FindOptions } from "@cocalc/conat/files/fs";
export type { FindOptions };
import exec, { type ExecOutput, validate } from "./exec";

export default async function find(
  path: string,
  { options, darwin, linux, timeout, maxSize }: FindOptions,
): Promise<ExecOutput> {
  if (path == null) {
    throw Error("path must be specified");
  }
  return await exec({
    cmd: "find",
    cwd: path,
    prefixArgs: [path ? path : "."],
    options,
    darwin,
    linux,
    maxSize,
    timeout,
    whitelist,
    safety: [],
  });
}

const whitelist = {
  // POSITIONAL OPTIONS
  "-daystart": true,
  "-regextype": validate.str,
  "-warn": true,
  "-nowarn": true,

  // GLOBAL OPTIONS
  "-d": true,
  "-depth": true,
  "--help": true,
  "-ignore_readdir_race": true,
  "-maxdepth": validate.int,
  "-mindepth": validate.int,
  "-mount": true,
  "-noignore_readdir_race": true,
  "--version": true,
  "-xdev": true,

  // TESTS
  "-amin": validate.float,
  "-anewer": validate.str,
  "-atime": validate.float,
  "-cmin": validate.float,
  "-cnewer": validate.str,
  "-ctime": validate.float,
  "-empty": true,
  "-executable": true,
  "-fstype": validate.str,
  "-gid": validate.int,
  "-group": validate.str,
  "-ilname": validate.str,
  "-iname": validate.str,
  "-inum": validate.int,
  "-ipath": validate.str,
  "-iregex": validate.str,
  "-iwholename": validate.str,
  "-links": validate.int,
  "-lname": validate.str,
  "-mmin": validate.int,
  "-mtime": validate.int,
  "-name": validate.str,
  "-newer": validate.str,
  "-newerXY": validate.str,
  "-nogroup": true,
  "-nouser": true,
  "-path": validate.str,
  "-perm": validate.str,
  "-readable": true,
  "-regex": validate.str,
  "-samefile": validate.str,
  "-size": validate.str,
  "-true": true,
  "-type": validate.str,
  "-uid": validate.int,
  "-used": validate.float,
  "-user": validate.str,
  "-wholename": validate.str,
  "-writable": true,
  "-xtype": validate.str,
  "-context": validate.str,

  // ACTIONS: obviously many are not whitelisted!
  "-ls": true,
  "-print": true,
  "-print0": true,
  "-printf": validate.str,
  "-prune": true,
  "-quit": true,

  // OPERATORS
  "(": true,
  ")": true,
  "!": true,
  "-not": true,
  "-a": true,
  "-and": true,
  "-o": true,
  "-or": true,
  ",": true,
} as const;
