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
  compute_server_id?: number;
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
  compute_server_id?: number;
}

interface MesgMoveFiles {
  cmd: "move_files";
  paths: string[];
  dest: string;
  compute_server_id: number | undefined;
}

interface MesgRenameFile {
  cmd: "rename_file";
  src: string;
  dest: string;
  compute_server_id: number | undefined;
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

export type ComputeFilesystemOptions =
  | {
      func: "filesToDelete";
      allComputeFiles: string;
    }
  | { func: "deleteWhiteouts"; whiteouts: { [path: string]: number } };

interface MesgComputeFilesystemCache {
  cmd: "compute_filesystem_cache";
  opts: ComputeFilesystemOptions;
}

export interface MesgSyncFSOptions {
  compute_server_id: number;
  computeStateJson?: string;
  computeStateDiffJson?: string; // TODO: this is NOT fully implemented
  exclude?: string[];
  now: number;
}

interface MesgSyncFS {
  cmd: "sync_fs";
  opts: MesgSyncFSOptions;
}

interface MesgComputeServerSyncRegister {
  cmd: "compute_server_sync_register";
  opts: { compute_server_id: number };
}

interface MesgComputeServerComputeRegister {
  cmd: "compute_server_compute_register";
  opts: { compute_server_id: number };
}

interface MesgComputeServerSyncRequest {
  cmd: "compute_server_sync_request";
  opts: { compute_server_id: number };
}

interface MesgCopyFromProjectToComputeServer {
  cmd: "copy_from_project_to_compute_server";
  opts: {
    compute_server_id: number;
    paths: string[];
    home?: string; // alternate home directory -- if relative, then is relative to actual HOME
    dest?: string;
    timeout?: number;
  };
}

interface MesgCopyFromComputeServerToProject {
  cmd: "copy_from_compute_server_to_project";
  opts: {
    compute_server_id: number;
    paths: string[];
    home?: string; // alternate home directory -- if relative, then is relative to actual HOME
    dest?: string;
    timeout?: number;
  };
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
  | MesgSynctableChannel
  | MesgSyncdocCall
  | MesgRealpath
  | MesgNBGrader
  | MesgJupyterNbconvert
  | MesgJupyterRunNotebook
  | MesgProjectInfo
  | MesgComputeFilesystemCache
  | MesgSyncFS
  | MesgComputeServerSyncRegister
  | MesgComputeServerComputeRegister
  | MesgComputeServerSyncRequest
  | MesgCopyFromProjectToComputeServer
  | MesgCopyFromComputeServerToProject;
