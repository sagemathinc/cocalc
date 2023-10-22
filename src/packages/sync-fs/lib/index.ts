/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 */

import walkdir from "walkdir";
import { join } from "path";
import { dynamicImport } from "tsimportlib";
import { makePatch } from "./patch";
import type { FilesystemState, FilesystemStatePatch } from "./types";

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
  }

  close = () => {};

  private getComputeStatePatch = async ({
    lastState,
    implementation,
  }: {
    lastState: FilesystemState;
    implementation?;
  }): Promise<FilesystemStatePatch> => {
    const newState = await this.getComputeState({ implementation });
    return makePatch(lastState, newState);
  };

  private getComputeState = async ({
    implementation = "find",
  }: {
    implementation?: "find" | "walkdir";
  } = {}): Promise<FilesystemState> => {
    // Create the map from all paths in upper (both directories and files and whiteouts),
    // except ones excluded from sync, to the ctime for the path (or negative ctime
    // for deleted paths):  {[path:string]:ctime of last change to file metadata}

    // NOTES: we do NOT use inotify, since on linux there is no possible way to watch
    // a directory tree for changes efficiently without potentially using large amounts
    // of memory and cpu.  E.g., one single cocalc dev tree is way too much.  Instead,
    // when doing sync, we will just walk the tree. Running 'find' as a subcommand seems
    // optimal, taking a few KB memory and about 1s for several hundred thousand files.
    // Using the walkdir library in sync mode takes several times as long; we leave that
    // code in below for comparison.

    const computeState: { [path: string]: number } = {};
    const whiteLen = "_HIDDEN~".length;
    const unionLen = UNIONFS.length;

    if (implementation == "walkdir") {
      //
      // sync is more than 2x faster, and fine for this application!
      const stats = walkdir.sync(this.upper, {
        return_object: true,
      });
      for (const path in stats) {
        if (path.startsWith(this.whiteouts)) {
          if (path.endsWith("_HIDDEN~")) {
            computeState[path.slice(this.whiteouts.length + 1, -whiteLen)] =
              -stats[path].ctimeMs;
          }
        } else {
          computeState[path.slice(this.upper.length + 1)] = stats[path].ctimeMs;
        }
      }
    } else if (implementation == "find") {
      // find is MUCH faster
      const { stdout } = await execa("find", [".", "-printf", "%P\n%C@\n"], {
        cwd: this.upper,
      });
      const v = stdout.split("\n");
      for (let i = 0; i < v.length - 1; i += 2) {
        const path = v[i];
        const ctime = parseFloat(v[i + 1]) * 1000;
        if (!path) {
          // the directory itself
          continue;
        }
        if (path.startsWith(UNIONFS)) {
          if (path.endsWith("_HIDDEN~")) {
            computeState[path.slice(unionLen + 1, -whiteLen)] = -ctime;
          }
        } else {
          computeState[path] = ctime;
        }
      }
    } else {
      throw Error(`invalid implementation '${implementation}'`);
    }

    return computeState;
  };
}

async function execa(...args) {
  const { execa: execa0 } = (await dynamicImport(
    "execa",
    module,
  )) as typeof import("execa");
  return await execa0.apply(null, args);
}
