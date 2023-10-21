/*
Manage a unionfs-cache'd remote mounted home directory.

This involves periodically syncing files between the compute
server and the project.

Key observation - because of latency, it is faster (and less data)
to create a compressed tarball, then tell the project to extract it,
instead of directly copy files around via the remote mount.

See ./unionfs-cache.md for a discussion of what this is.
*/

import { join } from "path";
import mkdirp from "mkdirp";
import { getmtime, touch } from "./util";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { execa } from "execa";
import { copyFile, open, rm, stat } from "fs/promises";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import SyncClient from "@cocalc/sync-client/lib/index";
import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import walkdir from "walkdir";
import { delay } from "awaiting";

import getLogger from "@cocalc/backend/logger";
const log = getLogger("compute:filesystem-cache").debug;

interface Options {
  lower: string;
  upper: string;
  mount: string;
  project_id: string;
  compute_server_id: number;
  // sync at most every this many seconds
  syncInterval?: number;
  settleTimeout?: number;
  // list of paths that are completely excluded from sync.
  // NOTE: hidden fils in HOME are always excluded
  exclude?: string[];
  readTrackingPath?: string;
}

export default function filesystemCache(opts: Options) {
  log("filesystemCache: ", opts);
  const cache = new FilesystemCache(opts);
  return cache;
}

type State = "init" | "ready" | "sync" | "closed";

class FilesystemCache {
  private state: State = "init";
  private lower: string;
  private upper: string;
  private mount: string;
  private project_id: string;
  private compute_server_id: number;

  private relProjectWorkdir: string;
  private projectWorkdir: string;
  private whiteouts: string;
  private computeWorkdir: string;

  private computeAllFilesList: string;
  private computeEditedFilesList: string;
  private computeEditedFilesTar: string;
  private computeEditedFilesTarCreateLocally: string;
  private relComputeEditedFilesTar: string;
  private projectEditedFilesTar: string;
  private projectEditedFilesTarFromCompute: string;
  private computeAllFilesListOnProject: string;
  private tarExclude: string[];
  private findExclude: string[];
  private readTrackingPath?: string;
  private readTrackingLower: string;
  private readTrackingOnProject: string;
  private readTrackingFilesTar: string;
  private readTrackingFilesTarOnProject: string;

  private last: string;
  private cur: string;
  private settleTimeMs: number;

  private client: SyncClient;

  private interval;

  constructor({
    lower,
    upper,
    mount,
    project_id,
    compute_server_id,
    syncInterval = 15,
    settleTimeout = 5,
    exclude = [],
    readTrackingPath,
  }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    this.readTrackingPath = readTrackingPath;
    log("created FilesystemCache", { mount: this.mount });
    if (/\s/.test(lower) || /\s/.test(upper) || /\s/.test(mount)) {
      throw Error("not whitespace is allowed in any paths");
    }
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.whiteouts = join(this.upper, ".unionfs-fuse");
    this.computeWorkdir = join(this.upper, ".compute-server");
    // ATTN!: this directory UPPER/.compute-server/read-tracking
    // is also set in ../filesystem.ts
    this.relProjectWorkdir = join(
      ".compute-servers",
      `${this.compute_server_id}`,
    );
    this.projectWorkdir = join(this.lower, this.relProjectWorkdir);
    this.computeEditedFilesList = join(
      this.computeWorkdir,
      "compute-edited-files-list",
    );
    this.computeAllFilesList = join(
      this.projectWorkdir,
      "compute-all-files-list",
    );
    this.readTrackingLower = join(this.projectWorkdir, "read-tracking");
    this.readTrackingOnProject = join(this.relProjectWorkdir, "read-tracking");
    this.computeAllFilesListOnProject = join(
      this.relProjectWorkdir,
      "compute-all-files-list",
    );
    const TAR_EXT = ".tar.gz";
    this.computeEditedFilesTarCreateLocally = join(
      this.computeWorkdir,
      `compute-edited-files${TAR_EXT}`,
    );
    this.computeEditedFilesTar = join(
      this.projectWorkdir,
      `compute-edited-files${TAR_EXT}`,
    );
    this.projectEditedFilesTar = join(
      this.relProjectWorkdir,
      `project-edited-files${TAR_EXT}`,
    );
    this.readTrackingFilesTarOnProject = join(
      this.relProjectWorkdir,
      `read-tracking${TAR_EXT}`,
    );
    this.readTrackingFilesTar = join(
      this.projectWorkdir,
      `read-tracking${TAR_EXT}`,
    );
    this.projectEditedFilesTarFromCompute = join(
      this.lower,
      this.projectEditedFilesTar,
    );

    this.relComputeEditedFilesTar = join(
      this.relProjectWorkdir,
      `compute-edited-files${TAR_EXT}`,
    );

    this.tarExclude = ["--exclude", "./.*"];
    this.findExclude = ["-not", "-path", "./.*", "-not", "-path", "."];
    for (const path of exclude) {
      this.tarExclude.push("--exclude");
      this.tarExclude.push(`./${path}`);
      this.findExclude.push("-not");
      this.findExclude.push("-path");
      this.findExclude.push(`./${path}`);
      this.findExclude.push("-not");
      this.findExclude.push("-path");
      this.findExclude.push(`./${path}/*`);
    }

    this.last = join(this.computeWorkdir, "last");
    this.cur = join(this.computeWorkdir, "cur");

    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
    });

    this.state = "ready";
    this.settleTimeMs = settleTimeout * 1000;

    this.interval = setInterval(this.sync, 1000 * syncInterval);
  }

  close = async () => {
    log("close FilesystemCache");
    if (this.state == "closed") {
      return;
    }
    this.state = "closed";
    if (this.interval != null) {
      clearInterval(this.interval);
    }
    delete this.interval;
  };

  private sync = async () => {
    if (this.state != "ready") {
      return;
    }
    log("sync");
    const t0 = Date.now();
    try {
      this.state = "sync";
      await this.makeDirs();
      // idea is to sync at least all changes from this.last until cur
      const cur = new Date(Date.now() - this.settleTimeMs);
      await touch(this.cur, cur);
      const last = await getmtime(this.last);
      await this.syncDeletesFromComputeToProject(cur);
      await this.syncWritesFromComputeToProject();
      await this.syncWritesFromProjectToCompute(last);
      await this.updateComputeFilesList("all");
      await this.syncDeletesFromProjectToCompute();
      await this.updateReadTracking();
      await touch(this.last, cur);
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

  private makeDirs = async () => {
    // Ensure that all relevant directories exist (in parallel)
    await Promise.all([
      mkdirp(this.computeWorkdir),
      mkdirp(this.projectWorkdir),
    ]);
  };

  private syncWritesFromComputeToProject = async () => {
    if (!(await this.updateComputeFilesList("edited"))) {
      // nothing changed
      return;
    }
    await this.updateComputeEditedFilesTar();
    await this.extractComputeEditedFilesInProject();
    await rm(this.computeEditedFilesTar);
  };

  // returns true if there is at least 1 file.
  // returns false and does NOT write the file if there are no files in the list.
  private updateComputeFilesList = async (
    type: "all" | "edited",
  ): Promise<boolean> => {
    // find files that aren't hidden top level, and also not ~/compute-server, and
    // (if type == 'edited') changed after last (if it exists).
    // TODO: for now we just find, since it's generic and fast enough (since this is a local
    // filesystem), but we may change this to use inotify and be event driven and much faster!
    // This would also make it easy to do the sync only once changing files stabilizes (e.g.,
    // debounce it).
    const args = [".", ...this.findExclude];
    if (type == "edited" && (await exists(this.last))) {
      args.push("-cnewer");
      args.push(this.last);
    }

    args.push("!");
    args.push("-cnewer");
    args.push(this.cur);

    if (type == "edited") {
      // critical to ONLY include files in the edited one. Otherwise,
      // we end up including every *directory* that has any file in it
      // that changed, which is HUGE.
      args.push("-type");
      args.push("f");
    }
    log(`updateComputeFilesList (in ${this.upper}):`, "find", args.join(" "));
    const { stdout } = await execa("find", args, { cwd: this.upper });
    let out;
    try {
      out = await open(
        type == "edited"
          ? this.computeEditedFilesList
          : this.computeAllFilesList,
        "w",
      );
      //log("updateComputeFilesList: output", stdout);
      await out.write(stdout);
      if (!stdout.length) {
        return false;
      }
      return true;
    } finally {
      await out?.close();
    }
  };

  private updateComputeEditedFilesTar = async () => {
    // TODO: unclear what compression (if any) is optimal for our usage.
    // At least make it configurable. need to balance speed to make tarball
    // (which slows down sync and uses CPU) with bandwidth
    // time and costs.

    // IMPORTANT.  No matter it's super important to *create* this file
    // first locally, then copy it over, rather than directly writing it
    // out to the slow filesystem. The reason is because creating it locally
    // is 1000x time faster, so it's FAR less likely to get broken by file activity,
    // whereas writing it is out could take a long time.
    // Also, writing to lower (the remote) costs money, whereas
    // writing locally doesn't.
    const args = [
      "-zcf",
      this.computeEditedFilesTarCreateLocally,
      "--verbatim-files-from",
      "--files-from",
      this.computeEditedFilesList,
    ];
    log("updateComputeEditedFilesTar:", "tar", args.join(" "));
    try {
      let success = false;
      let d = 500;
      const MAX_TRIES = 20;
      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          log("updateComputeEditedFilesTar:", "tar", args.join(" "));
          await execa("tar", args, { cwd: this.upper });
          success = true;
          break;
        } catch (err) {
          log(`updateComputeEditedFilesTar -- ${i}th try failed`, err);
          await delay(d);
          await this.updateComputeFilesList("edited");
          d = Math.min(7500, d * 1.3);
        }
      }
      if (!success) {
        throw Error("unable to create tarball of recently edited files");
      }
      log(
        "updateComputeEditedFilesTar: copying all edited files to project...",
      );
      await copyFile(
        this.computeEditedFilesTarCreateLocally,
        this.computeEditedFilesTar,
      );
      await execa("sync", [this.computeEditedFilesTar]);
    } finally {
      try {
        await rm(this.computeEditedFilesTarCreateLocally);
      } catch (_) {}
    }
  };

  private extractComputeEditedFilesInProject = async () => {
    // We use --keep-newer-files so that if a file is changed in the
    // project and it is newer than on compute, we just keep the project one.
    const MAX_TRIES = 5;
    const args = ["--keep-newer-files", "-xf", this.relComputeEditedFilesTar];
    for (let i = 0; i < MAX_TRIES; i++) {
      log("extractComputeEditedFilesInProject: tar ", args.join(" "));
      const { exit_code, stderr } = await this.execInProject({
        command: "tar",
        args,
        err_on_exit: false,
        timeout: 1800, // timeout in seconds.
      });
      if (
        exit_code == 0 ||
        stderr.includes("failure status due to previous errors")
      ) {
        // SUCCESS
        // this is going to happen in case of conflicts, e.g., create a file x on one side
        // and create a directory x on the other side.
        return;
      }
      log("WARNING -- extractComputeEditedFilesInProject -- ", stderr);
      // try again
      await delay(250);
    }
    // failed every time.
    throw Error("extractComputeEditedFilesInProject -- unable to extract");
  };

  private syncWritesFromProjectToCompute = async (last: Date) => {
    await this.updateProjectEditedFilesTar(last);
    await this.extractProjectEditedFilesInCompute();
    await rm(this.projectEditedFilesTarFromCompute);
  };

  // delete every file in compute that was deleted from the project since last.
  private syncDeletesFromProjectToCompute = async () => {
    log("syncDeletesFromProjectToCompute");
    const api = await this.client.project_client.api(this.project_id);
    const toDelete = await api.compute_filesystem_cache({
      func: "filesToDelete",
      allComputeFiles: this.computeAllFilesListOnProject,
    });
    log("********");
    log("syncDeletesFromProjectToCompute: toDelete = ", toDelete);
    log("********");
    const cutoff = Date.now() - this.settleTimeMs;
    for (const path of toDelete) {
      const abspath = join(this.upper, path);
      try {
        const { ctimeMs } = await stat(abspath);
        // log({ abspath, ctimeMs, cutoff });
        if (ctimeMs < cutoff) {
          // log("DELETE ", abspath);
          // only try to delete if file didn't change too recently locally
          await rm(abspath, { recursive: true });
        }
      } catch (_err) {
        //         log("syncDeletesFromProjectToCompute -- WARNING ", {
        //           abspath,
        //           err,
        //         });
      }
    }
  };

  // make a tarball of files that are newer than the last time
  // we did sync *and* are in the upper layer of the compute server,
  // so it actually matters to send them.
  private updateProjectEditedFilesTar = async (last: Date) => {
    const args = [
      "-zcf",
      this.projectEditedFilesTar,
      ...this.tarExclude,
      "--newer",
      last.toISOString(),
      "--verbatim-files-from",
      "--files-from",
      this.computeAllFilesList,
    ];
    log("updateProjectEditedFilesTar:", "tar", args.join(" "));
    const { stderr, exit_code } = await this.execInProject({
      command: "tar",
      args,
      err_on_exit: false,
      timeout: 1800, // timeout in seconds.
    });
    if (exit_code) {
      // it is normal to have a bunch of Cannot stat: No such file or directory
      // lines - that happens when files in this.computeAllFilesList aren't
      // in the project, because they got deleted. Lots of process (e.g., git clone)
      // create a bunch of files then delete them a moment later.
      const v = stderr.split("\n");
      const w = v.filter(
        (x) =>
          x.trim() &&
          !x.includes("Exiting with failure status due to previous errors") &&
          !x.includes("Cannot stat: No such file or directory"),
      );
      if (w.length > 0) {
        log("WARNING -- updateProjectEditedFilesTar -- ", w.join("\n"));
      }
    }
  };

  private extractProjectEditedFilesInCompute = async () => {
    // We use --keep-newer-files so that if a file is changed in
    // compute and it is newer than one from the project, we just
    // keep the newer one.
    const args = [
      "--keep-newer-files",
      "-xf",
      this.projectEditedFilesTarFromCompute,
    ];
    log("extractProjectEditedFilesInCompute", "tar", args.join(" "));
    await execa("tar", args, { cwd: this.upper });
  };

  private syncDeletesFromComputeToProject = async (cur: Date) => {
    log("syncDeletesFromComputeToProject");
    // Project deletes all these files, unless project modified a file more
    // recently.  Get back response that it was all done.
    // Get all whiteouts along with their timestamp to the project as a map
    // path |--> ms since epoch.
    if (!(await exists(this.whiteouts))) {
      // nothing to do
      return;
    }
    const stats = await walkdir.async(this.whiteouts, {
      return_object: true,
    });
    // log("syncDeletesFromComputeToProject", { stats });
    const whiteouts: { [path: string]: number } = {};
    const n = "_HIDDEN~".length;
    let j = 0;
    const cutoff = cur.valueOf();
    for (const path in stats) {
      if (path.endsWith("_HIDDEN~") && stats[path].mtimeMs <= cutoff) {
        j += 1;
        whiteouts[path.slice(this.whiteouts.length + 1, -n)] =
          stats[path].mtimeMs;
      }
    }
    // log("syncDeletesFromComputeToProject", { whiteouts });
    if (j == 0) {
      // nothing to do
      log("syncDeletesFromComputeToProject: nothing to do");
      return;
    }
    // Send them to the project to be deleted (unless conflict)
    const api = await this.client.project_client.api(this.project_id);
    await api.compute_filesystem_cache({
      func: "deleteWhiteouts",
      whiteouts,
    });

    // Delete all of these whiteout files locally, since they
    // are no longer needed.
    for (const path in stats) {
      if (path.endsWith("_HIDDEN~")) {
        try {
          await rm(path, { recursive: true });
        } catch (_) {}
      }
    }
  };

  private execInProject = async (
    opts: ExecuteCodeOptions,
  ): Promise<ExecuteCodeOutput> => {
    log("execInProject:", `"${opts.command} ${opts.args?.join(" ")}"`);
    const api = await this.client.project_client.api(this.project_id);
    return await api.exec(opts);
  };

  private updateReadTracking = async () => {
    if (!this.readTrackingPath) {
      return;
    }
    log("updateReadTracking");
    let file;
    try {
      file = await open(this.readTrackingPath);
    } catch (_) {
      // completely reasonable that the file doesn't exist.
      return;
    }
    const files = await file.readFile({ encoding: "utf8" });
    await file.close();
    const v = files
      .split("\n")
      .filter((x) => !x.startsWith("/.compute-server") && x.trim())
      .map((x) => x.slice(1));
    if (v.length == 0) {
      return;
    }
    const file2 = await open(this.readTrackingLower, "w");
    await file2.write(v.join("\n"));
    await file2.close();

    const args = [
      "-zcf",
      this.readTrackingFilesTarOnProject,
      "--verbatim-files-from",
      "--files-from",
      this.readTrackingOnProject,
    ];
    log("updateReadTracking:", "tar", args.join(" "));
    const { stderr, exit_code } = await this.execInProject({
      command: "tar",
      args,
      err_on_exit: false,
      timeout: 1800, // timeout in seconds.
    });
    if (exit_code) {
      // it is normal to have a bunch of Cannot stat: No such file or directory
      // lines - that happens when files in this.computeAllFilesList aren't
      // in the project, because they got deleted. Lots of process (e.g., git clone)
      // create a bunch of files then delete them a moment later.
      const v = stderr.split("\n");
      const w = v.filter(
        (x) =>
          x.trim() &&
          !x.includes("Exiting with failure status due to previous errors") &&
          !x.includes("Cannot stat: No such file or directory"),
      );
      if (w.length > 0) {
        log("WARNING -- updateReadTracking -- ", w.join("\n"));
      }
    }
    const args2 = ["--keep-newer-files", "-xf", this.readTrackingFilesTar];
    log("updateReadTracking", "tar", args2.join(" "));
    await execa("tar", args2, { cwd: this.upper });
  };
}
