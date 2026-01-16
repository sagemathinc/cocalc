/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
These are types related to the websocket communications API
between the frontend app and the project.
*/

import type {
  NBGraderAPIOptions,
  RunNotebookOptions,
} from "@cocalc/util/jupyter/nbgrader-types";
import type { Channel } from "@cocalc/sync/client/types";
import type { Options } from "@cocalc/util/code-formatter";
export type { Channel };

export type ConfigurationAspect = "main" | "x11";

export interface NbconvertParams {
  args: string[];
  directory?: string;
  timeout?: number; // in seconds!
}

interface MesgVersion {
  cmd: "version";
}

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

interface MesgJupyterNbconvert {
  cmd: "jupyter_nbconvert";
  opts: NbconvertParams;
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

interface MesgRealpath {
  cmd: "realpath";
  path: string;
}

interface MesgProjectInfo {
  cmd: "project_info";
}

interface MesgQuery {
  cmd: "query";
  opts: any;
}


export type Mesg =
  | MesgVersion
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
  | MesgQuery
  | MesgX11Channel
  | MesgRealpath
  | MesgNBGrader
  | MesgJupyterNbconvert
  | MesgJupyterRunNotebook
  | MesgProjectInfo
  ;
