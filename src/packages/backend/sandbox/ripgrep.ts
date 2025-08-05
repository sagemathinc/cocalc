import exec, { type ExecOutput, validate } from "./exec";
import type { RipgrepOptions } from "@cocalc/conat/files/fs";
export type { RipgrepOptions };
import { ripgrep as ripgrepPath } from "./install";

export default async function ripgrep(
  path: string,
  pattern: string,
  { options, darwin, linux, timeout, maxSize }: RipgrepOptions = {},
): Promise<ExecOutput> {
  if (path == null) {
    throw Error("path must be specified");
  }
  if (pattern == null) {
    throw Error("pattern must be specified");
  }

  return await exec({
    cmd: ripgrepPath,
    cwd: path,
    positionalArgs: [pattern],
    options,
    darwin,
    linux,
    maxSize,
    timeout,
    whitelist,
    // if large memory usage is an issue, it might be caused by parallel interleaving; using
    // -j1 below will prevent that, but will make ripgrep much slower (since not in parallel).
    // See the ripgrep man page.
    safety: ["--no-follow", "--block-buffered", "--no-config" /* "-j1"*/],
  });
}

const whitelist = {
  "-e": validate.str,

  "-s": true,
  "--case-sensitive": true,

  "--crlf": true,

  "-E": validate.set([
    "utf-8",
    "utf-16",
    "utf-16le",
    "utf-16be",
    "ascii",
    "latin-1",
  ]),
  "--encoding": validate.set([
    "utf-8",
    "utf-16",
    "utf-16le",
    "utf-16be",
    "ascii",
    "latin-1",
  ]),

  "--engine": validate.set(["default", "pcre2", "auto"]),

  "-F": true,
  "--fixed-strings": true,

  "-i": true,
  "--ignore-case": true,

  "-v": true,
  "--invert-match": true,

  "-x": true,
  "--line-regexp": true,

  "-m": validate.int,
  "--max-count": validate.int,

  "-U": true,
  "--multiline": true,

  "--multiline-dotall": true,

  "--no-unicode": true,

  "--null-data": true,

  "-P": true,
  "--pcre2": true,

  "-S": true,
  "--smart-case": true,

  "--stop-on-nonmatch": true,

  // this allows searching in binary files -- there is some danger of this
  // using a lot more memory.  Hence we do not allow it.
  //   "-a": true,
  //   "--text": true,

  "-w": true,
  "--word-regexp": true,

  "--binary": true,

  "-g": validate.str,
  "--glob": validate.str,
  "--glob-case-insensitive": true,

  "-.": true,
  "--hidden": true,

  "--iglob": validate.str,

  "--ignore-file-case-insensitive": true,

  "-d": validate.int,
  "--max-depth": validate.int,

  "--max-filesize": validate.str,

  "--no-ignore": true,
  "--no-ignore-dot": true,
  "--no-ignore-exclude": true,
  "--no-ignore-files": true,
  "--no-ignore-global": true,
  "--no-ignore-parent": true,
  "--no-ignore-vcs": true,
  "--no-require-git": true,
  "--one-file-system": true,

  "-t": validate.str,
  "--type": validate.str,
  "-T": validate.str,
  "--type-not": validate.str,
  "--type-add": validate.str,
  "--type-list": true,
  "--type-clear": validate.str,

  "-u": true,
  "--unrestricted": true,

  "-A": validate.int,
  "--after-context": validate.int,
  "-B": validate.int,
  "--before-context": validate.int,

  "-b": true,
  "--byte-offset": true,

  "--color": validate.set(["never", "auto", "always", "ansi"]),
  "--colors": validate.str,

  "--column": true,
  "-C": validate.int,
  "--context": validate.int,

  "--context-separator": validate.str,
  "--field-context-separator": validate.str,
  "--field-match-separator": validate.str,

  "--heading": true,
  "--no-heading": true,

  "-h": true,
  "--help": true,

  "--include-zero": true,

  "-n": true,
  "--line-number": true,
  "-N": true,
  "--no-line-number": true,

  "-M": validate.int,
  "--max-columns": validate.int,

  "--max-columns-preview": validate.int,

  "-O": true,
  "--null": true,

  "--passthru": true,

  "-p": true,
  "--pretty": true,

  "-q": true,
  "--quiet": true,

  // From the docs: "Neither this flag nor any other ripgrep flag will modify your files."
  "-r": validate.str,
  "--replace": validate.str,

  "--sort": validate.set(["none", "path", "modified", "accessed", "created"]),
  "--sortr": validate.set(["none", "path", "modified", "accessed", "created"]),

  "--trim": true,
  "--no-trim": true,

  "--vimgrep": true,

  "-H": true,
  "--with-filename": true,

  "-I": true,
  "--no-filename": true,

  "-c": true,
  "--count": true,

  "--count-matches": true,
  "-l": true,
  "--files-with-matches": true,
  "--files-without-match": true,
  "--json": true,

  "--debug": true,
  "--no-ignore-messages": true,
  "--no-messages": true,

  "--stats": true,

  "--trace": true,

  "--files": true,

  "--generate": validate.set([
    "man",
    "complete-bash",
    "complete-zsh",
    "complete-fish",
    "complete-powershell",
  ]),

  "--pcre2-version": true,
  "-V": true,
  "--version": true,
} as const;
