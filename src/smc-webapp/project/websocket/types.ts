/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Options } from "../../smc-project/formatters";

type Cmd =
  | "lean"
  | "syncdoc_call"
  | "listing"
  | "delete_files"
  | "move_files"
  | "rename_file"
  | "canonical_paths"
  | "configuration"
  | "jupyter_strip_notebook"
  | "nbgrader"
  | "jupyter_run_notebook"
  | "jupyter"
  | "eval_code"
  | "symmetric_channel"
  | "synctable_channel"
  | "x11_channel"
  | "lean_channel"
  | "realpath"
  | "terminal"
  | "jupyter";

// TODO define each Mesg separately and tell TS to decide the type on what `cmd:...` is
interface MesgGenereal {
  cmd: Cmd;
  name?: any;
  path?: any;
  paths?: any;
  no_cache?: any;
  src?: any;
  dest?: any;
  opts?: any;
  endpoint?: any;
  syncdoc_call?: any;
  lean?: any;
  ipynb_path?: any;
  syncdoc_call?: any;
  code?: any;
  hidden?: any;
  aspect?: any;
  display?: any;
  query?: any;
  mesg?: any;
}

interface MesgExec {
  cmd: "exec";
  opts: any;
}

interface MesgFormatterString {
  cmd:
    | "prettier_string" // deprecated, use "formatter_string"
    | "formatter_string";
  path: string;
  str: string;
  options: Options;
}

interface MesgFormatter {
  cmd:
    | "prettier" // deprecated, use "formatter"
    | "formatter";
  path: string;
  options: Options;
}

export type Mesg = MesgExec | MesgGeneral | MesgFormatterString | MesgFormatter;

export interface Channel {
  write(x: any): boolean;
  on(event: string, f: Function): void;
  end(): void;
  close(): void;
  connect(): void;
  conn: any;
  channel: string;
}
