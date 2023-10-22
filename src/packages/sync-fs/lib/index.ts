/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { makePatch } from "./patch";
import type { FilesystemState, FilesystemStatePatch } from "./types";
import { mtimeDirTree } from "./util";
import { toCompressedJSON } from "./compressed-json";
import SyncClient from "@cocalc/sync-client/lib/index";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";

//import getLogger from "@cocalc/backend/logger";
//const log = getLogger("compute:filesystem-cache").debug;
const log = console.log;

export default function syncFS(opts: Options) {
  log("syncFS: ", opts);
  return new SyncFS(opts);
}

type State = "init" | "ready" | "sync" | "closed";

interface Options {
  lower: string;
  upper: string;
  mount: string;
  project_id: string;
  compute_server_id: number;
  // sync at most every this many seconds
  syncInterval?: number;
  // list of paths that are excluded from sync.
  // NOTE: hidden files in HOME are always excluded
  exclude?: string[];
  readTrackingPath?: string;
}

const UNIONFS = ".unionfs-fuse";

class SyncFS {
  private state: State = "init";
  private lower: string;
  private upper: string;
  private mount: string;
  private project_id: string;
  private compute_server_id: number;
  private exclude: string[];
  private readTrackingPath?: string;

  private whiteouts: string;
  private client: SyncClient;

  constructor({
    lower,
    upper,
    mount,
    project_id,
    compute_server_id,
    syncInterval = 10,
    exclude = [],
    readTrackingPath,
  }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.exclude = exclude;
    this.readTrackingPath = readTrackingPath;

    this.whiteouts = join(this.upper, UNIONFS);

    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
    });
  }

  close = () => {};

  private getComputeStatePatch = async (
    lastState: FilesystemState,
  ): Promise<FilesystemStatePatch> => {
    const newState = await this.getComputeState();
    return makePatch(lastState, newState);
  };

  private getComputeState = async (): Promise<FilesystemState> => {
    // Create the map from all paths in upper (both directories and files and whiteouts),
    // except ones excluded from sync, to the ctime for the path (or negative mtime
    // for deleted paths):  {[path:string]:mtime of last change to file metadata}
    const whiteLen = "_HIDDEN~".length;
    const unionLen = UNIONFS.length;
    const computeState: { [path: string]: number } = {};
    const mtimes = await mtimeDirTree({
      path: this.upper,
      exclude: this.exclude,
    });
    for (const path in mtimes) {
      const mtime = mtimes[path];
      if (path.startsWith(UNIONFS)) {
        if (path.endsWith("_HIDDEN~")) {
          computeState[path.slice(unionLen + 1, -whiteLen)] = -mtime;
        }
      } else {
        computeState[path] = mtime;
      }
    }
    return computeState;
  };

  private sendState = async () => {
    const api = await this.client.project_client.api(this.project_id);
    const computeState = toCompressedJSON(await this.getComputeState());
    const operations = await api.syncFS({
      computeState,
      exclude: this.exclude,
    });
  };
}
