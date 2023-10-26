/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { cp, mkdir, rm, stat, readFile, writeFile } from "fs/promises";
import { join } from "path";
//import { makePatch } from "./patch";
import type { FilesystemState /*FilesystemStatePatch*/ } from "./types";
import { createTarball, execa, mtimeDirTree, remove } from "./util";
import { toCompressedJSON } from "./compressed-json";
import SyncClient from "@cocalc/sync-client/lib/index";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import getLogger from "@cocalc/backend/logger";
import { apiCall } from "@cocalc/api-client";
import { plural } from "@cocalc/util/misc";

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
  // NOTE: hidden files in HOME are *always* excluded.
  exclude?: string[];
  readTrackingPath?: string;
}

const UNIONFS = ".unionfs-fuse";
const DEFAULT_SYNC_INTERVAL_MIN_S = 3;
// no idea what this should be.  It might be even 60s, but with
// more UI and other queues to ping us.
const DEFAULT_SYNC_INTERVAL_MAX_S = 15;

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

  mountUnionFS = async () => {
    // unionfs-fuse -o allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768 /upper=RW:/home/user=RO /merged
    await execa("unionfs-fuse", [
      "-o",
      "allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768",
      `${this.upper}=RW:${this.lower}=RO`,
      this.mount,
    ]);
  };

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
    } catch (err) {
      const e = `${err}`;
      this.reportState({ state: "error", extra: e });
      await this.logSyncError(e);
      throw err;
    } finally {
      if (this.state != ("closed" as State)) {
        this.state = "ready";
      }
      log("sync - SUCCESS, time=", (Date.now() - t0) / 1000);
    }
  };

  private syncLoop = async () => {
    const t0 = Date.now();
    if (this.state == "ready") {
      log("syncLoop: ready");
      try {
        await this.sync();
      } catch (err) {
        // This will happen if there is a lot of filesystem activity
        // which changes things during the sync.
        log(`sync - WARNING: sync loop failed -- ${err}`);
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
    log("reportState", opts);
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
        state: "send-files-to-project",
        progress: 50,
        extra: `${copyFromCompute?.length ?? 0} ${plural(
          copyFromCompute?.length ?? 0,
          "file",
        )}`,
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
    const tmpdir = join(this.upper, UNIONFS, ".compute-servers");
    await mkdir(tmpdir, { recursive: true });
    const tarball = await createTarball(
      join(this.scratch, "copy-to-project"),
      files,
      this.upper,
      tmpdir,
    );

    const i = tarball.lastIndexOf(".compute-servers");
    const args = [
      // --delay-directory-restore is so that directories don't
      // have WRONG mtimes, and also do NOT do --keep-newer-files,
      // which horribly breaks things.
      "--delay-directory-restore",
      "-xf",
      tarball.slice(i),
    ];
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
    log("receiveFiles", tarball);
    const target = join(this.lower, tarball);
    const args = ["--delay-directory-restore", "-xf", target];
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

  private createReadTrackingTarball = async (recentFiles: string[]) => {
    const readTrackingOnProject = join(
      ".compute-servers",
      `${this.compute_server_id}`,
      "read-tracking",
    );
    const readTrackingFilesTarOnProject = join(
      ".compute-servers",
      `${this.compute_server_id}`,
      "read-tracking.tar",
    );
    await writeFile(
      join(this.lower, readTrackingOnProject),
      recentFiles.join("\n"),
    );
    const args = [
      "-cf",
      readTrackingFilesTarOnProject,
      "--no-recursion",
      "--verbatim-files-from",
      "--files-from",
      readTrackingOnProject,
    ];
    log("createReadTrackingTarball:", "tar", args.join(" "));
    await this.execInProject({
      command: "tar",
      args,
      // very important that ANY error, e.g., file modified during write,
      // etc. throw exception, since we don't want to copy over a corrupted
      // file... and this tracking is 100% only for performance.
      err_on_exit: true,
      timeout: 60 * 2, // timeout in seconds.
    });
    return readTrackingFilesTarOnProject;
  };

  private extractRecentlyReadFiles = async (tarball) => {
    // We copy the tarball over locally first, to maximize speed of extraction,
    // since during extract file can be "corrupted" due to being partly written.
    const local = join(this.upper, UNIONFS, ".compute-servers", "recent.tar");
    try {
      await cp(join(this.lower, tarball), local);
      try {
        await rm(join(this.lower, tarball));
      } catch (_) {}
      const args2 = ["--keep-newer-files", "-xf", local];
      log("extractRecentlyReadFiles", "tar", args2.join(" "));
      await execa("tar", args2, { cwd: this.upper });
    } finally {
      try {
        await rm(local);
      } catch (_) {}
    }
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
      const tarball = await this.createReadTrackingTarball(recentFiles);
      await this.extractRecentlyReadFiles(tarball);
    } catch (err) {
      log("updateReadTracking: not updating due to err", `${err}`);
    }
  };
}
