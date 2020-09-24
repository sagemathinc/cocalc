/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import {
  NBGraderAPIOptions,
  RunNotebookOptions,
} from "../../jupyter/nbgrader/api";
import { Options } from "../../smc-project/formatters";
import { ConfigurationAspect } from "../smc-webapp/project_configuration";

interface MesgExec {
  cmd: "exec";
  opts: any;
}

interface MesgDeleteFiles {
  cmd: "delete_files";
  paths: string[];
}

interface MesgFormatterString {
  cmd:
    | "prettier_string" // deprecated, use "formatter_string"
    | "formatter_string";
  path?: string | undefined;
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

interface MesgListing {
  cmd: "listing";
  path: string;
  hidden: boolean;
}

interface MesgMoveFiles {
  cmd: "move_files";
  paths: string[];
  dest: string;
}

interface MesgRenameFile {
  cmd: "rename_file";
  src: string;
  dest: string;
}

interface MesgCanonicalPaths {
  cmd: "canonical_paths";
  paths: string[];
}

interface MesgConfiguration {
  cmd: "configuration";
  aspect: ConfigurationAspect;
  no_cache: boolean;
}

interface MesgJupyter {
  cmd: "jupyter";
  path: string;
  endpoint: string;
  query: any;
}

interface MesgJupyterStripNotebook {
  cmd: "jupyter_strip_notebook";
  ipynb_path: string;
}

interface MesgNBGrader {
  cmd: "nbgrader";
  opts: NBGraderAPIOptions;
}

interface MesgJupyterRunNotebook {
  cmd: "jupyter_run_notebook";
  opts: RunNotebookOptions;
}

interface MesgEvalCode {
  cmd: "eval_code";
  code: string;
}

interface MesgTerminal {
  cmd: "terminal";
  path: string;
  options: any;
}

interface MesgLean {
  cmd: "lean";
  opts: any;
}

interface MesgLeanChannel {
  cmd: "lean_channel";
  path: string;
}

interface MesgX11Channel {
  cmd: "x11_channel";
  path: string;
  display: number;
}

interface MesgSynctableChannel {
  cmd: "synctable_channel";
  query: any;
  options: any[];
}

interface MesgSyncdocCall {
  cmd: "syncdoc_call";
  path: string;
  mesg: any;
}

interface MesgSymmetricChannel {
  cmd: "symmetric_channel";
  name: string;
}

interface MesgRealpath {
  cmd: "realpath";
  path: string;
}

export type Mesg =
  | MesgExec
  | MesgDeleteFiles
  | MesgFormatterString
  | MesgFormatter
  | MesgListing
  | MesgMoveFiles
  | MesgRenameFile
  | MesgCanonicalPaths
  | MesgConfiguration
  | MesgJupyter
  | MesgJupyterStripNotebook
  | MesgEvalCode
  | MesgTerminal
  | MesgLean
  | MesgLeanChannel
  | MesgX11Channel
  | MesgSynctableChannel
  | MesgSyncdocCall
  | MesgSymmetricChannel
  | MesgRealpath
  | MesgNBGrader
  | MesgJupyterRunNotebook;

export interface Channel {
  write(x: any): boolean;
  on(event: string, f: Function): void;
  end(): void;
  close(): void;
  connect(): void;
  conn: any;
  channel: string;
}
