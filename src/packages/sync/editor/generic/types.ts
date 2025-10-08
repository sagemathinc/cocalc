/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * license
 */

// A Patch is an entry in the patches table, as represented in memory locally here.

import { SyncTable } from "@cocalc/sync/table/synctable";
import { type CompressedPatch } from "@cocalc/util/dmp";
export { type CompressedPatch };

import type { ExecuteCodeOptionsWithCallback } from "@cocalc/util/types/execute-code";
import type {
  CallConatServiceFunction,
  CreateConatServiceFunction,
} from "@cocalc/conat/service";

export interface Patch {
  // time = LOGICAL time of when patch made; this used to be ms since the epoch, but just
  // has to an increasing sequence of numbers.  It does distinguish between different users
  // by the congruence class of the number.
  time: number;
  // wall = wallclock time of when patch made; plays no role at all in the algorithm and
  // is purely to **display to the user**.  For backward compat and display, if wall is
  // not defined in then this should fall back to the time field.
  wall?: number;
  patch?: CompressedPatch /* compressed format patch -- an array/object (not JSON string) */;
  user_id: number /* 0-based integer "id" of user
                     syncstring table has id-->account_id map) */;
  size: number; // size of the patch (by defn length of string representation)

  is_snapshot?: boolean;
  snapshot?: string; // to_str() applied to the document at this point in time
  seq_info?: {
    // seq = sequence number of the message with the patch/timestamp of the snapshot.
    // Load with start_seq = seq to get all patch info back to this snapshot.
    seq: number;
    // prev_seq = sequence numbrer of *previous* snapshot patch.
    // Load with start_seq = prev_seq to get all info about timetravel
    // back to previous snapshot.  That previous snapshot will itself
    // have a prev_seq, etc., making it possible to incremental load
    // patches back in time.
    prev_seq?: number;
  };

  // The set of all patches forms a directed acyclic graph.
  // There is an edge from the patch to its parents, which were all source
  // vertices that were *known* when the patch was made.
  // Right now, creating a new patch always
  // involves merging all parents known to this client.  However, that's not
  // required by this data structure: instead parents could just be the branches
  // that we are merging.  I.e., we might only add something when
  // the user wants to manually do a merge.  That's for later...
  parents?: number[];

  version?: number;
}

export interface Document {
  apply_patch(CompressedPatch): Document;
  make_patch(Document): CompressedPatch;
  is_equal(Document): boolean;
  to_str(): string;
  set(any): Document; // returns new document with result of set
  get(any?): any; // returns result of get query on document (error for string)
  get_one(any?): any; // returns result of get_one query on document (error for string)
  delete(any?): Document; // delete something from Document (error for string)

  // optional info about what changed going from prev to this.
  changes(prev?: Document): any;
  // how many in this document (length of string number of records in db-doc, etc.)
  count(): number;
}

export interface FileWatcher {
  on: (event: string, handler: Function) => void;
  close: () => void;
}

/* This is what we need from the "client".
There's actually a completely separate client
that runs in the browser and one on the project,
but anything that has the following interface
might work... */
import { EventEmitter } from "events";

export interface ProjectClient extends EventEmitter {
  server_time: () => Date;
  is_project: () => boolean;
  is_browser: () => boolean;
  is_compute_server: () => boolean;
  is_connected: () => boolean;
  is_signed_in: () => boolean;
  dbg: (desc: string) => Function;

  query: (opts: { query: any; cb: Function }) => void;

  // Only required to work on project client.
  path_access: (opts: { path: string; mode: string; cb: Function }) => void;

  path_exists: (opts: { path: string; cb: Function }) => void;

  path_stat: (opts: { path: string; cb: Function }) => void;

  path_read: (opts: {
    path: string;
    maxsize_MB?: number;
    cb: Function;
  }) => Promise<void>;

  write_file: (opts: {
    path: string;
    data: string;
    cb: Function;
  }) => Promise<void>;

  watch_file: (opts: { path: string }) => FileWatcher;

  synctable_ephemeral?: (
    project_id: string,
    query: any,
    options: any,
    throttle_changes?: number,
    id?: string,
  ) => Promise<SyncTable>;

  synctable_conat: (query: any, obj?) => Promise<any>;
  pubsub_conat: (query: any, obj?) => Promise<any>;
  callConatService?: CallConatServiceFunction;
  createConatService?: CreateConatServiceFunction;

  // account_id or project_id or compute_server_id (encoded as a UUID - use decodeUUIDtoNum to decode)
  client_id: () => string;

  is_deleted: (
    filename: string,
    project_id?: string,
  ) => boolean | undefined | null;
  set_deleted: (filename: string, project_id?: string) => void;

  ipywidgetsGetBuffer?: (
    project_id: string, // id of the project
    path: string, // path = name of ipynb file
    model_id: string, // id of the ipywidgets model
    buffer_path: string, // JSON.stringify(['binary','buffer','path'])
  ) => ArrayBuffer;
}

export interface Client extends ProjectClient {
  log_error?: (opts: {
    project_id: string;
    path: string;
    string_id: string;
    error: any;
  }) => void;

  mark_file?: (opts: {
    project_id: string;
    path: string;
    action: string;
    ttl: number;
  }) => void;

  shell: (opts: ExecuteCodeOptionsWithCallback) => void;

  sage_session: (opts: { path: string }) => any;

  touchOpenFile?: (opts: {
    project_id: string;
    path: string;
    doctype?;
  }) => Promise<void>;

  touch_project?: (path: string) => void;
}

export interface DocType {
  type: string;
  patch_format?: number; // 0=string or 1=dbdoc, if given
  opts?: { [key: string]: any };
}
