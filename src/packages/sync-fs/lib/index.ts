/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { mkdir, open, rm, stat, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { FilesystemState /*FilesystemStatePatch*/ } from "./types";
import { execa, mtimeDirTree, remove } from "./util";
import { toCompressedJSON } from "./compressed-json";
import SyncClient from "@cocalc/sync-client/lib/index";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import getLogger from "@cocalc/backend/logger";
import { apiCall } from "@cocalc/api-client";

const log = getLogger("sync-fs:index").debug;

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
  syncIntervalMin?: number;
  // but up to this long if there is no activity (exponential backoff)
  syncIntervalMax?: number;
  // list of top-level directory names that are excluded from sync.
  // do not use wildcards.
  // RECOMMEND: hidden files in HOME should be excluded, which you can do by including "./*"
  // ALSO: if you have "~" or "." in the exclude array, then sync is completely disabled.
  exclude?: string[];
  readTrackingPath?: string;
  tar: { send; get };
  compression?: "lz4"; // default 'lz4'
}

const UNIONFS = ".unionfs-fuse";
// Do not make this too short, since every time it happens, the project has to
// do a find scan, which can take some resources!
const DEFAULT_SYNC_INTERVAL_MIN_S = 10;
// no idea what this *should* be.
const DEFAULT_SYNC_INTERVAL_MAX_S = 30;

// if sync fails this many times in a row, then we pause syncing until the user
// explicitly re-enables it.  We have to do this, since the failure mode could
// result in massive bandwidth usage.
const MAX_FAILURES_IN_A_ROW = 3;

class SyncFS {
  private state: State = "init";
  private lower: string;
  private upper: string;
  private mount: string;
  private project_id: string;
  private compute_server_id: number;
  private syncInterval: number;
  private syncIntervalMin: number;
  private syncIntervalMax: number;
  private exclude: string[];
  private readTrackingPath?: string;
  private scratch: string;
  private error_txt: string;
  private tar: { send; get };
  // number of failures in a row to sync.
  private numFails: number = 0;

  private client: SyncClient;

  private timeout;

  constructor({
    lower,
    upper,
    mount,
    project_id,
    compute_server_id,
    syncIntervalMin = DEFAULT_SYNC_INTERVAL_MIN_S,
    syncIntervalMax = DEFAULT_SYNC_INTERVAL_MAX_S,
    exclude = [],
    readTrackingPath,
    tar,
    compression = "lz4",
  }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.exclude = exclude;
    this.syncInterval = syncIntervalMin;
    this.syncIntervalMin = syncIntervalMin;
    this.syncIntervalMax = syncIntervalMax;
    this.readTrackingPath = readTrackingPath;
    this.scratch = join(
      this.lower,
      ".compute-servers",
      `${this.compute_server_id}`,
    );
    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
    });
    this.state = "ready";
    this.error_txt = join(this.scratch, "error.txt");
    if (!compression) {
      this.tar = tar;
    } else if (compression == "lz4") {
      const alter = (v) => ["-I", "lz4"].concat(v);
      this.tar = {
        send: ({ createArgs, extractArgs }) => {
          createArgs = alter(createArgs);
          extractArgs = alter(extractArgs);
          tar.send({ createArgs, extractArgs });
        },
        get: ({ createArgs, extractArgs }) => {
          createArgs = alter(createArgs);
          extractArgs = alter(extractArgs);
          tar.get({ createArgs, extractArgs });
        },
      };
    } else {
      throw Error(`invalid compression: '${compression}'`);
    }
  }

  init = async () => {
    await this.mountUnionFS();
    await this.makeScratchDir();
    try {
      await rm(this.error_txt);
    } catch (_) {}
    await this.syncLoop();
  };

  close = async () => {
    log("close");
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      delete this.timeout;
    }
    const args = ["-uz", this.mount];
    log("fusermount", args.join(" "));
    await execa("fusermount", args);
  };

  private mountUnionFS = async () => {
    // unionfs-fuse -o allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768 /upper=RW:/home/user=RO /merged
    await execa("unionfs-fuse", [
      "-o",
      "allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768",
      `${this.upper}=RW:${this.lower}=RO`,
      this.mount,
    ]);
  };

  private bindMountExcludes = async () => {
    // Setup bind mounds for each excluded directory, e.g., 
    // mount --bind /data/scratch /home/user/scratch
    
  }

  public sync = async () => {
    if (this.state == "sync") {
      throw Error("sync currently in progress");
    }
    if (this.state != "ready") {
      throw Error(
        `can only sync when state is ready but state is "${this.state}"`,
      );
    }
    log("sync: doing a sync");
    const t0 = Date.now();
    try {
      this.state = "sync";
      await this.doSync();
      this.numFails = 0; // it worked
    } catch (err) {
      this.numFails += 1;
      let extra;
      if (this.numFails >= MAX_FAILURES_IN_A_ROW) {
        extra = `Sync failed ${MAX_FAILURES_IN_A_ROW} in a row.  FIX THE PROBLEM, THEN CLEAR THIS ERROR TO RESUME SYNC. -- ${err.message.slice(
          0,
          250,
        )}`;
      } else {
        extra = `Sync failed ${
          this.numFails
        } times in a row with -- ${err.message.slice(0, 200)}...`;
      }
      this.reportState({ state: "error", extra, timeout: 60, progress: 0 });
      await this.logSyncError(extra);
      throw Error(extra);
    } finally {
      if (this.state != ("closed" as State)) {
        this.state = "ready";
      }
      log("sync - done, time=", (Date.now() - t0) / 1000);
    }
  };

  private syncLoop = async () => {
    if (this.exclude.includes("~") || this.exclude.includes(".")) {
      log("syncLoop: '~' or '.' is included in excludes, so we never sync");
      const wait = 1000 * 60;
      log(`syncLoop -- sleeping ${wait / 1000} seconds...`);
      this.timeout = setTimeout(this.syncLoop, wait);
      return;
    }
    const t0 = Date.now();
    if (this.state == "ready") {
      log("syncLoop: ready");
      try {
        if (this.numFails >= MAX_FAILURES_IN_A_ROW) {
          // TODO: get the current error message and if cleared do sync.  Otherwise:
          const detailedState = await this.getDetailedState();
          if (
            detailedState &&
            (!detailedState.extra || detailedState.state != "error")
          ) {
            log("syncLoop: resuming sync since error was cleared");
            this.numFails = 0;
            await this.sync();
          } else {
            log(
              `syncLoop: not syncing due to failing ${this.numFails} times in a row. Will restart when error message is cleared.`,
            );
          }
        } else {
          await this.sync();
        }
      } catch (err) {
        // This might happen if there is a lot of filesystem activity,
        // which changes things during the sync.
        // NOTE: the error message can be VERY long, including
        // all the output filenames.
        log(err.message);
        // In case of error, we aggressively back off to reduce impact.
        this.syncInterval = Math.min(
          this.syncIntervalMax,
          1.5 * this.syncInterval,
        );
      }
    } else {
      log("sync: skipping since state = ", this.state);
    }
    // We always wait as long as the last sync took plus the
    // next interval. This way if sync is taking a long time
    // due to huge files or load, we spread it out, up to a point,
    // which is maybe a good idea.   If sync is fast, it's fine
    // to do it frequently.
    const wait = Math.min(
      this.syncIntervalMax * 1000,
      this.syncInterval * 1000 + (Date.now() - t0),
    );
    log(`syncLoop -- sleeping ${wait / 1000} seconds...`);
    this.timeout = setTimeout(this.syncLoop, wait);
  };

  private makeScratchDir = async () => {
    await mkdir(this.scratch, { recursive: true });
  };

  private logSyncError = async (mesg: string) => {
    try {
      await writeFile(this.error_txt, mesg);
    } catch (err) {
      log(`UNABLE to log sync err -- ${err}`);
    }
  };

  // save current state to database; useful to inform user as to what is going on.
  private reportState = async (opts: {
    state;
    extra?;
    timeout?;
    progress?;
  }) => {
    log("reportState");
    try {
      await apiCall("v2/compute/set-detailed-state", {
        id: this.compute_server_id,
        name: "filesystem-sync",
        ...opts,
      });
    } catch (err) {
      log("reportState: WARNING -- ", err);
    }
  };

  private getDetailedState = async () => {
    return await apiCall("v2/compute/get-detailed-state", {
      id: this.compute_server_id,
      name: "filesystem-sync",
    });
  };

  private doSync = async () => {
    log("doSync");
    this.reportState({ state: "get-compute-state", progress: 0, timeout: 10 });
    await this.makeScratchDir();
    const api = await this.client.project_client.api(this.project_id);
    const { computeState, whiteouts } = await this.getComputeState();
    // log("doSync", computeState, whiteouts);
    const computeStateJson = join(
      ".compute-servers",
      `${this.compute_server_id}`,
      "compute-state.json.lz4",
    );
    await writeFile(
      join(this.lower, computeStateJson),
      toCompressedJSON(computeState),
    );
    this.reportState({
      state: "send-state-to-project",
      progress: 20,
      timeout: 10,
    });
    const { removeFromCompute, copyFromCompute, copyFromProjectTar } =
      await api.syncFS({
        computeStateJson,
        exclude: this.exclude,
        compute_server_id: this.compute_server_id,
        now: Date.now(),
      });

    // log("doSync", { removeFromCompute, copyFromCompute, copyFromProjectTar });
    let isActive = false;
    if (whiteouts.length > 0) {
      isActive = true;
      await remove(whiteouts, join(this.upper, UNIONFS));
    }
    if (removeFromCompute?.length ?? 0 > 0) {
      isActive = true;
      await remove(removeFromCompute, this.upper);
    }
    if (copyFromCompute?.length ?? 0 > 0) {
      isActive = true;
      this.reportState({
        state: `send-${copyFromCompute?.length ?? 0}-files-to-project`,
        progress: 50,
      });
      await this.sendFiles(copyFromCompute);
    }
    if (copyFromProjectTar) {
      isActive = true;
      this.reportState({
        state: "receive-files-from-project",
        progress: 70,
      });
      await this.receiveFiles(copyFromProjectTar);
    }

    if (isActive) {
      this.syncInterval = this.syncIntervalMin;
    } else {
      // exponential backoff when not active
      this.syncInterval = Math.min(
        this.syncIntervalMax,
        1.3 * this.syncInterval,
      );
    }
    await this.updateReadTracking();

    this.reportState({
      state: "ready",
      progress: 100,
      timeout: 3 + this.syncInterval,
    });
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
    const computeState = await mtimeDirTree({
      path: this.upper,
      exclude: this.exclude,
    });
    const whiteouts: string[] = [];
    const unionfs = join(this.upper, UNIONFS);
    const mtimes = await mtimeDirTree({
      path: unionfs,
      exclude: [],
    });
    for (const path in mtimes) {
      const mtime = mtimes[path];
      if (path.endsWith("_HIDDEN~")) {
        const p = path.slice(0, -whiteLen);
        whiteouts.push(path);
        if ((await stat(join(unionfs, path))).isDirectory()) {
          whiteouts.push(p);
        }
        computeState[p] = -mtime;
      }
    }

    return { computeState, whiteouts };
  };

  private sendFiles = async (files: string[]) => {
    const target = join(this.scratch, "copy-to-project");
    log("sendFiles: sending ", files.length, "files listed in ", target);
    const file = await open(target, "w");
    await file.write(files.join("\n"));
    await file.close();
    const createArgs = [
      "-c",
      "--no-recursion",
      "--verbatim-files-from",
      "--files-from",
      target,
    ];
    const extractArgs = ["--delay-directory-restore", "-x"];
    await this.tar.send({ createArgs, extractArgs });
    log("sendFiles: ", files.length, "sent");
  };

  // pathToFileList is the path to a file in the filesystem on
  // in the project that has the names of the files to copy to
  // the compute server.
  private receiveFiles = async (pathToFileList: string) => {
    log("receiveFiles: getting files in from project -- ", pathToFileList);
    // this runs in the project
    const createArgs = [
      "-c",
      "--no-recursion",
      "--verbatim-files-from",
      "--files-from",
      pathToFileList,
    ];
    // this runs here
    const extractArgs = ["--delay-directory-restore", "-x"];
    await this.tar.get({
      createArgs,
      extractArgs,
    });
    log("receiveFiles: files in ", pathToFileList, "received from project");
  };

  private isExcluded = (path: string) => {
    if (!path || path.startsWith(".")) {
      return true;
    }
    for (const e of this.exclude) {
      if (path == e || path.startsWith(e + "/")) {
        return true;
      }
    }
    return false;
  };

  private getRecentlyReadFiles = async (): Promise<string[]> => {
    if (!this.readTrackingPath) {
      return [];
    }
    let files;
    try {
      files = await readFile(this.readTrackingPath, { encoding: "utf8" });
    } catch (err) {
      // completely reasonable that the file doesn't exist.
      log("getRecentlyReadFiles: ", this.readTrackingPath, err);
      return [];
    }
    const v = files
      .split("\n")
      .map((x) => x.slice(1))
      .filter((x) => !this.isExcluded(x));
    log("getRecentlyReadFiles: ", v.length, " files");
    //log("getRecentlyReadFiles: ", v);  // low level debug
    return v;
  };

  private getReadTrackingFiles = async (recentFiles: string[]) => {
    const readTrackingOnProject = join(
      ".compute-servers",
      `${this.compute_server_id}`,
      "read-tracking",
    );
    await writeFile(
      join(this.lower, readTrackingOnProject),
      recentFiles.join("\n"),
    );
    const createArgs = [
      "-c",
      "--no-recursion",
      "--verbatim-files-from",
      "--files-from",
      readTrackingOnProject,
    ];
    const extractArgs = ["--keep-newer-files", "-x"];
    log("createReadTrackingTarball:", "tar", createArgs.join(" "));
    this.tar.get({ createArgs, extractArgs });
  };

  private updateReadTracking = async () => {
    if (!this.readTrackingPath) {
      return;
    }
    const recentFiles = await this.getRecentlyReadFiles();
    if (recentFiles.length == 0) {
      return;
    }
    this.reportState({
      state: "cache-files-from-project",
      progress: 85,
    });
    try {
      await this.getReadTrackingFiles(recentFiles);
    } catch (err) {
      log("updateReadTracking: not updating due to err", `${err}`);
    }
  };
}
