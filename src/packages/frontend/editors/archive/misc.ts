/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface Entry {
  list: { command: string; args: ReadonlyArray<string> };
  extract: { command: string; args: ReadonlyArray<string> };
}

const bz2: Entry = {
  list: { command: "ls", args: ["-l"] },
  extract: { command: "bunzip2", args: ["-vf"] },
};

const tbz2: Entry = {
  list: { command: "tar", args: ["-jtvf"] },
  extract: { command: "tar", args: ["-xjf"] },
};

const tgz: Entry = {
  list: { command: "tar", args: ["-tzf"] },
  extract: { command: "tar", args: ["-xvzf"] },
};

export const COMMANDS: { [type: string]: Entry } = {
  "tar.bz2": tbz2,
  tbz2: tbz2,
  zip: {
    list: { command: "unzip", args: ["-l"] },
    extract: { command: "unzip", args: ["-B"] },
  },
  tar: {
    list: { command: "tar", args: ["-tf"] },
    extract: { command: "tar", args: ["-xvf"] },
  },
  tgz,
  "tar.gz": tgz,
  gz: {
    list: { command: "gzip", args: ["-l"] },
    extract: { command: "gunzip", args: ["-vf"] },
  },
  bz2,
  bzip2: bz2,
  lzip: {
    list: { command: "ls", args: ["-l"] },
    extract: { command: "lzip", args: ["-vfd"] },
  },
  xz: {
    list: { command: "xz", args: ["-l"] },
    extract: { command: "xz", args: ["-vfd"] },
  },
} as const;

// all keys of COMMANDS, that have at least one "." in their name
export const DOUBLE_EXT = Object.keys(COMMANDS).filter(
  (key) => key.indexOf(".") >= 0
);
