/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  copyFile,
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { basename, dirname, join } from "path";
import type { FilesystemState /*FilesystemStatePatch*/ } from "./types";
import { execa, mtimeDirTree, parseCommonPrefixes, remove } from "./util";
import { toCompressedJSON } from "./compressed-json";
import SyncClient, { type Role } from "@cocalc/sync-client/lib/index";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import getLogger from "@cocalc/backend/logger";
import { apiCall } from "@cocalc/api-client";
import mkdirp from "mkdirp";
import { throttle } from "lodash";
import { trunc_middle } from "@cocalc/util/misc";
import getListing from "@cocalc/backend/get-listing";
import { executeCode } from "@cocalc/backend/execute-code";
import { delete_files } from "@cocalc/backend/files/delete-files";
import { move_files } from "@cocalc/backend/files/move-files";
import { rename_file } from "@cocalc/backend/files/rename-file";
import { initConatClientService } from "./conat/syncfs-client";
import { initConatServerService } from "./conat/syncfs-server";

const EXPLICIT_HIDDEN_EXCLUDES = [".cache", ".local"];

const log = getLogger("sync-fs:index").debug;
const REGISTER_INTERVAL_MS = 30000;

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
  readTrackingFile?: string;
  tar: { send; get };
  compression?: "lz4"; // default 'lz4'
  data?: string; // absolute path to data directory (default: /data)
  role: Role;
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

export class SyncFS {
  private state: State = "init";
  private lower: string;
  private upper: string;
  private mount: string;
  private data: string;
  private project_id: string;
  private compute_server_id: number;
  private syncInterval: number;
  private registerToSyncInterval?;
  private syncIntervalMin: number;
  private syncIntervalMax: number;
  private exclude: string[];
  private readTrackingFile?: string;
  private scratch: string;
  private error_txt: string;
  private tar: { send; get };
  // number of failures in a row to sync.
  private numFails: number = 0;
  private conatService;

  private client: SyncClient;

  private timeout;
  private websocket?;

  private role: Role;

  constructor({
    lower,
    upper,
    mount,
    project_id,
    compute_server_id,
    syncIntervalMin = DEFAULT_SYNC_INTERVAL_MIN_S,
    syncIntervalMax = DEFAULT_SYNC_INTERVAL_MAX_S,
    exclude = [],
    readTrackingFile,
    tar,
    compression = "lz4",
    data = "/data",
    role,
  }: Options) {
    this.role = role;
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    this.data = data;
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.exclude = exclude;
    this.syncInterval = syncIntervalMin;
    this.syncIntervalMin = syncIntervalMin;
    this.syncIntervalMax = syncIntervalMax;
    this.readTrackingFile = readTrackingFile;
    this.scratch = join(
      this.lower,
      ".compute-servers",
      `${this.compute_server_id}`,
    );
    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
      role,
    });
    this.state = "ready";
    this.error_txt = join(this.scratch, "error.txt");
    if (!compression) {
      this.tar = tar;
    } else if (compression == "lz4") {
      const alter = (v) => ["-I", "lz4"].concat(v);
      this.tar = {
        send: async ({ createArgs, extractArgs, HOME }) => {
          createArgs = alter(createArgs);
          extractArgs = alter(extractArgs);
          await tar.send({ createArgs, extractArgs, HOME });
        },
        get: async ({ createArgs, extractArgs, HOME }) => {
          createArgs = alter(createArgs);
          extractArgs = alter(extractArgs);
          await tar.get({ createArgs, extractArgs, HOME });
        },
      };
    } else {
      throw Error(`invalid compression: '${compression}'`);
    }
  }

  init = async () => {
    await this.initConatService();
    await this.mountUnionFS();
    await this.bindMountExcludes();
    await this.makeScratchDir();
    try {
      await rm(this.error_txt);
    } catch (_) {}
    await this.initSyncRequestHandler();
    await this.syncLoop();
  };

  close = async () => {
    log("close");
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    if (this.conatService != null) {
      this.conatService.close();
      delete this.conatService;
    }
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      delete this.timeout;
    }
    if (this.registerToSyncInterval) {
      clearInterval(this.registerToSyncInterval);
      delete this.registerToSyncInterval;
    }
    const args = ["-uz", this.mount];
    log("fusermount", args.join(" "));
    try {
      await execa("fusermount", args);
    } catch (err) {
      log("fusermount fail -- ", err);
    }
    try {
      await this.unmountExcludes();
    } catch (err) {
      log("unmountExcludes fail -- ", err);
    }
    this.websocket?.removeListener("data", this.handleApiRequest);
    this.websocket?.removeListener("state", this.registerToSync);
  };

  // The sync api listens on the project websocket for requests
  // to do a sync.  There's no response (for now).
  //   Project --> ComputeServer:   "heh, please do a sync now"
  private initSyncRequestHandler = async () => {
    log("initSyncRequestHandler: installing sync request handler");
    this.websocket = await this.client.project_client.websocket(
      this.project_id,
    );
    this.websocket.on("data", this.handleApiRequest);
    log("initSyncRequestHandler: installed handler");
    this.registerToSync();
    // We use *both* a period interval and websocket state change,
    // since we can't depend on just the state change to always
    // be enough, unfortunately... :-(
    this.registerToSyncInterval = setInterval(
      this.registerToSync,
      REGISTER_INTERVAL_MS,
    );
    this.websocket.on("state", this.registerToSync);
  };

  private registerToSync = async (state = "online") => {
    if (state != "online") return;
    try {
      log("registerToSync: registering");
      const api = await this.client.project_client.api(this.project_id);
      await api.computeServerSyncRegister(this.compute_server_id);
      await apiCall("v2/compute/set-detailed-state", {
        id: this.compute_server_id,
        state: "ready",
        progress: 100,
        name: "filesystem",
        timeout: Math.round(REGISTER_INTERVAL_MS / 1000) + 15,
      });
      log("registerToSync: registered");
    } catch (err) {
      log("registerToSync: ERROR -- ", err);
    }
  };

  private handleApiRequest = async (data) => {
    try {
      log("handleApiRequest:", { data });
      const resp = await this.doApiRequest(data);
      log("handleApiRequest: ", { resp });
      if (data.id && this.websocket != null) {
        this.websocket.write({
          id: data.id,
          resp,
        });
      }
    } catch (err) {
      // console.trace(err);
      const error = `${err}`;
      if (data.id && this.websocket != null) {
        log("handleApiRequest: returning error", { event: data?.event, error });
        this.websocket.write({
          id: data.id,
          error,
        });
      } else {
        log("handleApiRequest: ignoring error", { event: data?.event, error });
      }
    }
  };

  doApiRequest = async (data) => {
    log("doApiRequest", { data });
    switch (data?.event) {
      case "compute_server_sync_request":
        try {
          if (this.state == "sync") {
            // already in progress
            return;
          }
          if (!this.syncIsDisabled()) {
            await this.sync();
          }
          log("doApiRequest: sync worked");
        } catch (err) {
          log("doApiRequest: sync failed", err);
        }
        return;

      case "copy_from_project_to_compute_server":
      case "copy_from_compute_server_to_project": {
        const extractArgs = ["-x"];
        extractArgs.push("-C");
        extractArgs.push(data.dest ? data.dest : ".");
        const HOME = this.mount;
        for (const { prefix, paths } of parseCommonPrefixes(data.paths)) {
          const createArgs = ["-c", "-C", prefix, ...paths];
          log({ extractArgs, createArgs });
          if (data.event == "copy_from_project_to_compute_server") {
            await this.tar.get({
              createArgs,
              extractArgs,
              HOME,
            });
          } else if (data.event == "copy_from_compute_server_to_project") {
            await this.tar.send({
              createArgs,
              extractArgs,
              HOME,
            });
          } else {
            // impossible
            throw Error(`bug -- invalid event ${data.event}`);
          }
        }
        return;
      }

      case "listing":
        return await getListing(data.path, data.hidden, { HOME: this.mount });

      case "exec":
        return await executeCode({ ...data.opts, home: this.mount });

      case "delete_files":
        return await delete_files(data.paths, this.mount);

      case "move_files":
        return await move_files(
          data.paths,
          data.dest,
          (path) => this.client.set_deleted(path),
          this.mount,
        );
      case "rename_file":
        return await rename_file(
          data.src,
          data.dest,
          (path) => this.client.set_deleted(path),
          this.mount,
        );

      default:
        throw Error(`unknown event '${data?.event}'`);
    }
  };

  private mountUnionFS = async () => {
    // NOTE: allow_other is essential to allow bind mounted as root
    // of fast scratch directories into HOME!
    // unionfs-fuse -o allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768 /upper=RW:/home/user=RO /merged
    await execa("unionfs-fuse", [
      "-o",
      "allow_other,auto_unmount,nonempty,large_read,cow,max_files=32768",
      `${this.upper}=RW:${this.lower}=RO`,
      this.mount,
    ]);
  };

  private shouldMountExclude = (path) => {
    return (
      path &&
      !path.startsWith(".") &&
      !path.startsWith("/") &&
      path != "~" &&
      !path.includes("/")
    );
  };

  private unmountExcludes = async () => {
    for (const path of this.exclude) {
      if (this.shouldMountExclude(path)) {
        try {
          const target = join(this.mount, path);
          log("unmountExcludes -- unmounting", { target });
          await execa("sudo", ["umount", target]);
        } catch (err) {
          log("unmountExcludes -- warning ", err);
        }
      }
    }
  };

  private bindMountExcludes = async () => {
    // Setup bind mounds for each excluded directory, e.g.,
    // mount --bind /data/scratch /home/user/scratch
    for (const path of this.exclude) {
      if (this.shouldMountExclude(path)) {
        log("bindMountExcludes -- mounting", { path });
        const source = join(this.data, path);
        const target = join(this.mount, path);
        const upper = join(this.upper, path);
        log("bindMountExcludes -- mounting", { source, target });
        await mkdirp(source);
        // Yes, we have to mkdir in the upper level of the unionfs, because
        // we excluded this path from the websocketfs metadataFile caching.
        await mkdirp(upper);
        await execa("sudo", ["mount", "--bind", source, target]);
      } else {
        log("bindMountExcludes -- skipping", { path });
      }
    }
    // The following are (1) not mounted above due to shouldMountExclude,
    // and (2) always get exclued, and (3) start with . so could conflict
    // with the unionfs upper layer, so we change them:
    for (const path of EXPLICIT_HIDDEN_EXCLUDES) {
      log("bindMountExcludes -- explicit hidden path ", { path });
      const source = join(this.data, `.explicit${path}`);
      const target = join(this.mount, path);
      const upper = join(this.upper, path);
      log("bindMountExcludes -- explicit hidden path", { source, target });
      await mkdirp(source);
      await mkdirp(upper);
      await execa("sudo", ["mount", "--bind", source, target]);
    }
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
      await this.__doSync();
      this.numFails = 0; // it worked
      this.reportState({
        state: "ready",
        progress: 100,
        timeout: 3 + this.syncInterval,
      });
    } catch (err) {
      this.numFails += 1;
      let extra;
      let message = trunc_middle(`${err.message}`, 500);
      if (this.numFails >= MAX_FAILURES_IN_A_ROW) {
        extra = `XXX Sync failed ${MAX_FAILURES_IN_A_ROW} in a row.  FIX THE PROBLEM, THEN CLEAR THIS ERROR TO RESUME SYNC. -- ${message}`;
      } else {
        extra = `XXX Sync failed ${this.numFails} times in a row with -- ${message}`;
      }
      // extra here sets visible error state that the user sees.
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

  private syncIsDisabled = () => {
    if (this.exclude.includes("~") || this.exclude.includes(".")) {
      log("syncLoop: '~' or '.' is included in excludes, so we never sync");
      return true;
    }
    return false;
  };

  private syncLoop = async () => {
    if (this.syncIsDisabled()) {
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

  // Save current state to database; useful to inform user as to what is going on.
  // We throttle this, because if you call it, then immediately call it again,
  // two different hub servers basically gets two different stats at the same time,
  // and which state is saved to the database is pretty random! By spacing this out
  // by 2s, such a problem is vastly less likely.
  private reportState = throttle(
    async (opts: { state; extra?; timeout?; progress? }) => {
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
    },
    1500,
    { leading: true, trailing: true },
  );

  private getDetailedState = async () => {
    return await apiCall("v2/compute/get-detailed-state", {
      id: this.compute_server_id,
      name: "filesystem-sync",
    });
  };

  // ONLY call this from this.sync!
  private __doSync = async () => {
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
      await toCompressedJSON(computeState),
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
    log("DONE receiving files from project as part of sync");

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
    await file.write(files.join("\0"));
    await file.close();
    const createArgs = [
      "-c",
      "--null",
      "--no-recursion",
      "--verbatim-files-from",
      "--files-from",
      target,
    ];
    const extractArgs = ["--delay-directory-restore", "-x"];
    await this.tar.send({ createArgs, extractArgs });
    log("sendFiles: ", files.length, "sent");
  };

  // pathToFileList is the path to a file in the file system on
  // in the project that has the names of the files to copy to
  // the compute server.
  private receiveFiles = async (pathToFileList: string) => {
    log("receiveFiles: getting files in from project -- ", pathToFileList);
    // this runs in the project
    const createArgs = [
      "-c",
      "--null",
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

  private updateReadTracking = async () => {
    if (!this.readTrackingFile) {
      return;
    }
    // 1. Move the read tracking file to the project.  We do a move, so atomic
    // and new writes go to a new file and nothing is missed.
    // 2. Call tar.get to grab the files.
    // NOTE: read tracking isn't triggered on any files that were copied over,
    // since unionfs reads those from the local cache (stat doesn't count), so
    // we don't have to filter those out.

    // We make any errors below WARNINGS that do not throw an exception, because
    // this is an optimization, not critical for sync, and each time we do it,
    // things are reset.
    const readTrackingOnProject = join(
      ".compute-servers",
      `${this.compute_server_id}`,
      "read-tracking",
    );
    this.reportState({
      state: "cache-files-from-project",
      progress: 80,
    });
    try {
      try {
        // move the file; first locally, then copy across devices, then delete.
        // This is to make the initial mv atomic so we don't miss anything.
        const tmp = join(
          dirname(this.readTrackingFile),
          `.${basename(this.readTrackingFile)}.tmp`,
        );
        await rename(this.readTrackingFile, tmp); // should be atomic
        await copyFile(tmp, join(this.lower, readTrackingOnProject));
        await rm(tmp);
      } catch (err) {
        if (err.code == "ENOENT") {
          log(
            `updateReadTracking -- no read tracking file '${this.readTrackingFile}'`,
          );
          return;
        }
        // this could be harmless, e.g., the file doesn't exist yet
        log(
          `updateReadTracking -- issue moving tracking file '${this.readTrackingFile}'`,
          err,
        );
        return;
      }
      const createArgs = [
        "-c",
        "--null",
        "--no-recursion",
        "--verbatim-files-from",
        "--files-from",
        readTrackingOnProject,
      ];
      const extractArgs = ["--keep-newer-files", "-x"];
      log("updateReadTracking:", "tar", createArgs.join(" "));
      try {
        await this.tar.get({ createArgs, extractArgs });
      } catch (err) {
        log(
          `updateReadTracking -- issue extracting tracking file '${this.readTrackingFile}'`,
          err,
        );
        return;
      }
    } finally {
      this.reportState({
        state: "cache-files-from-project",
        progress: 85,
      });
    }
  };

  initConatService = async () => {
    if (this.role == "compute_server") {
      this.conatService = await initConatClientService({
        syncfs: this,
        project_id: this.project_id,
        compute_server_id: this.compute_server_id,
      });
    } else if (this.role == "project") {
      this.conatService = await initConatServerService({
        syncfs: this,
        project_id: this.project_id,
      });
    } else {
      throw Error("only compute_server and project roles are supported");
    }
  };
}
