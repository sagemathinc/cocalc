/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { mkdir, rm } from "fs/promises";
import { join } from "path";
//import { makePatch } from "./patch";
import type { FilesystemState /*FilesystemStatePatch*/ } from "./types";
import { createTarball, execa, mtimeDirTree, remove } from "./util";
//import { toCompressedJSON } from "./compressed-json";
import SyncClient from "@cocalc/sync-client/lib/index";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("sync-fs:index").debug;

export default function syncFS(opts: Options) {
  log("syncFS: ", opts);
  return new SyncFS(opts);
}

type State = "init" | "ready" | "sync" | "closed";

interface Options {
  lower: string;
  upper: string;
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
  private project_id: string;
  private compute_server_id: number;
  private exclude: string[];
  //private readTrackingPath?: string;

  private client: SyncClient;

  private interval;

  constructor({
    lower,
    upper,
    project_id,
    compute_server_id,
    syncInterval = 10,
    exclude = [], //readTrackingPath,
  }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.exclude = exclude;
    //this.readTrackingPath = readTrackingPath;

    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
    });
    this.state = "ready";

    this.interval = setInterval(this.sync, 1000 * syncInterval);
  }

  close = async () => {
    log("close");
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    if (this.interval != null) {
      clearInterval(this.interval);
      delete this.interval;
    }
  };

  private sync = async () => {
    if (this.state != "ready") {
      return;
    }
    log("sync");
    const t0 = Date.now();
    try {
      this.state = "sync";
      // await this.updateReadTracking();
      await this.doSync();
    } catch (err) {
      console.trace(err);
      // This will happen if there is a lot of filesystem activity
      // which changes things during the sync.
      log(Date.now() - t0, "sync - WARNING: sync loop failed -- ", err);
    } finally {
      if (this.state != ("closed" as State)) {
        this.state = "ready";
      }
      log(
        "sync - SUCCESS, time=",
        (Date.now() - t0) / 1000,
        " seconds.  Sleeping...",
      );
    }
  };

  private doSync = async () => {
    const api = await this.client.project_client.api(this.project_id);
    const { computeState, whiteouts } = await this.getComputeState();
    //const computeStateJson = toCompressedJSON(computeState);
    const { removeFromCompute, copyFromCompute, copyFromProjectTar } =
      await api.syncFS({
        computeStateJson: computeState,
        exclude: this.exclude,
        compute_server_id: this.compute_server_id,
      });

    if (whiteouts.length > 0) {
      await remove(whiteouts, this.upper);
    }
    if (removeFromCompute?.length ?? 0 > 0) {
      await remove(removeFromCompute, this.upper);
    }
    if (copyFromCompute?.length ?? 0 > 0) {
      await this.sendFiles(copyFromCompute);
    }
    if (copyFromProjectTar) {
      await this.receiveFiles(copyFromProjectTar);
    }
  };

  //   private getComputeStatePatch = async (
  //     lastState: FilesystemState,
  //   ): Promise<FilesystemStatePatch> => {
  //     // todo -- whiteouts?
  //     const { computeState: newState } = await this.getComputeState();
  //     return makePatch(lastState, newState);
  //   };

  private getComputeState = async (): Promise<{
    computeState: FilesystemState;
    whiteouts: string[];
  }> => {
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
    const whiteouts: string[] = [];
    for (const path in mtimes) {
      const mtime = mtimes[path];
      if (path.startsWith(UNIONFS)) {
        if (path.endsWith("_HIDDEN~")) {
          const p = path.slice(unionLen + 1, -whiteLen);
          whiteouts.push(path);
          whiteouts.push(p); // [ ] TODO: is it every necessary to include this?
          computeState[p] = -mtime;
        }
      } else {
        computeState[path] = mtime;
      }
    }
    return { computeState, whiteouts };
  };

  private sendFiles = async (files: string[]) => {
    const scratch = join(
      this.lower,
      ".compute-servers",
      `${this.compute_server_id}`,
    );
    await mkdir(scratch, { recursive: true });
    const tarball = await createTarball(
      join(scratch, "copy-to-project"),
      files,
    );
    const i = tarball.lastIndexOf(".compute-servers");

    const args = ["--keep-newer-files", "-xf", tarball.slice(i)];
    log("sendFiles", "tar", args.join(" "));
    await this.execInProject({
      command: "tar",
      args,
      err_on_exit: false,
      timeout: 60 * 15, // timeout in seconds.
    });

    await rm(tarball);
  };

  private receiveFiles = async (tarball: string) => {
    const target = join(this.lower, tarball);
    const args = ["--keep-newer-files", "-xf", target];
    log("receiveFiles", "tar", args.join(" "));
    await execa("tar", args, { cwd: this.upper });
    await rm(target);
  };

  private execInProject = async (
    opts: ExecuteCodeOptions,
  ): Promise<ExecuteCodeOutput> => {
    log("execInProject:", `"${opts.command} ${opts.args?.join(" ")}"`);
    const api = await this.client.project_client.api(this.project_id);
    return await api.exec(opts);
  };
}
