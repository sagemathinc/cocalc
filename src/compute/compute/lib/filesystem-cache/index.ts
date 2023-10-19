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
import { open, unlink } from "fs/promises";
import { encodeIntToUUID } from "@cocalc/util/compute/manager";
import SyncClient from "@cocalc/sync-client/lib/index";
import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("compute:filesystem-cache");

interface Options {
  lower: string;
  upper: string;
  mount: string;
  project_id: string;
  compute_server_id: number;
  cacheTimeout?: number; // sync every this many  seconds
}

export default function filesystemCache(opts: Options) {
  logger.debug("filesystemCache: ", opts);
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
  private projectWhiteoutdir: string;
  private computeWorkdir: string;

  private computeAllFilesList: string;
  private computeEditedFilesList: string;
  private computeEditedFilesTar: string;
  private relComputeEditedFilesTar: string;
  private projectEditedFilesTar: string;
  private projectEditedFilesTarFromCompute: string;

  private last: string;

  private client: SyncClient;

  private interval;

  constructor({
    lower,
    upper,
    mount,
    project_id,
    compute_server_id,
    cacheTimeout = 20,
  }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    logger.debug("created FilesystemCache", { mount: this.mount });
    if (/\s/.test(lower) || /\s/.test(upper) || /\s/.test(mount)) {
      throw Error("not whitespace is allowed in any paths");
    }
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.projectWhiteoutdir = join(this.upper, ".unionfs-fuse");
    this.computeWorkdir = join(this.upper, ".compute-server");
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
    this.computeEditedFilesTar = join(
      this.projectWorkdir,
      "compute-edited-files.tar.xz",
    );
    this.projectEditedFilesTar = join(
      this.relProjectWorkdir,
      "project-edited-files.tar.xz",
    );
    this.projectEditedFilesTarFromCompute = join(
      this.lower,
      this.projectEditedFilesTar,
    );
    this.relComputeEditedFilesTar = join(
      this.relProjectWorkdir,
      "compute-edited-files.tar.xz",
    );
    this.last = join(this.computeWorkdir, "last");

    this.client = new SyncClient({
      project_id: this.project_id,
      client_id: encodeIntToUUID(this.compute_server_id),
    });

    this.state = "ready";

    this.interval = setInterval(this.sync, 1000 * cacheTimeout);
    this.sync();
  }

  close = async () => {
    logger.debug("close FilesystemCache");
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
    logger.debug("sync");
    if (this.state != "ready") {
      return;
    }
    try {
      this.state = "sync";
      await this.makeDirs();
      // idea is to sync at least all changes from this.last until cur
      const cur = new Date();
      const last = await getmtime(this.last);
      await this.syncWritesFromComputeToProject();
      await this.syncWritesFromProjectToCompute(last);
      await touch(this.last, cur);
    } finally {
      if (this.state != ("closed" as State)) {
        this.state = "ready";
      }
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
    await unlink(this.computeEditedFilesTar);
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
    const args = [
      ".",
      "-type",
      "f",
      "-not",
      "-path",
      "./compute-server*",
      "-not",
      "-path",
      "./.*",
    ];
    if (type == "edited" && (await exists(this.last))) {
      args.push("-newer");
      args.push(this.last);
    }
    logger.debug(
      `updateComputeEditedFilesList (in ${this.upper}):`,
      "find",
      args.join(" "),
    );
    const { stdout } = await execa("find", args, { cwd: this.upper });
    const out = await open(
      type == "edited" ? this.computeEditedFilesList : this.computeAllFilesList,
      "w",
    );
    if (!stdout.length) {
      return false;
    }
    await out.write(stdout);
    await out.close();
    return true;
  };

  private updateComputeEditedFilesTar = async () => {
    // TODO: unclear what compression is optimal for our usage. At least make it configurable.
    // need to balance speed to make tarball (which slows down sync and uses CPU) with bandwidth
    // time and costs.
    //
    // We do not just  use --newer for this because of
    //   https://serverfault.com/questions/536219/is-it-possible-to-exclude-empty-directories-when-creating-a-tar
    /*const args = [
      "-cJf",
      this.computeEditedFilesTar,
      "--exclude",
      "./.*",
      "--exclude",
      "./compute-server",
      "--newer",
      last.toISOString(),
      ".",
    ];*/

    const args = [
      "-cJf",
      this.computeEditedFilesTar,
      "--verbatim-files-from",
      "--files-from",
      this.computeEditedFilesList,
    ];
    logger.debug("updateComputeEditedFilesTar:", "tar", args.join(" "));
    await execa("tar", args, { cwd: this.upper });
  };

  private extractComputeEditedFilesInProject = async () => {
    // We use --keep-newer-files so that if a file is changed in the
    // project and it is newer than on compute, we just keep the project one.
    const { exit_code, stderr } = await this.execInProject({
      command: "tar",
      args: ["--keep-newer-files", "-xf", this.relComputeEditedFilesTar],
      err_on_exit: false,
    });
    if (
      exit_code == 0 ||
      stderr.includes("failure status due to previous errors")
    ) {
      // this is going to happen in case of conflicts, e.g., create a file x on one side
      // and create a directory x on the other side.
      return;
    }
    // what to do?
    if (exit_code) {
      logger.debug("WARNING -- updateProjectEditedFilesTar -- ", stderr);
    }
  };

  private syncWritesFromProjectToCompute = async (last: Date) => {
    if (!(await this.updateComputeFilesList("all"))) {
      // no files at all, so nothing to worry about
      return;
    }
    await this.updateProjectEditedFilesTar(last);
    await this.extractProjectEditedFilesInCompute();
    await unlink(this.projectEditedFilesTarFromCompute);
  };

  // make a tarball of files that are newer than the last time
  // we did sync *and* are in the upper layer of the compute server.
  private updateProjectEditedFilesTar = async (last: Date) => {
    const args = [
      "-cJf",
      this.projectEditedFilesTar,
      "--exclude",
      "./.*",
      "--exclude",
      "./compute-server",
      "--newer",
      last.toISOString(),
      "--verbatim-files-from",
      "--files-from",
      this.computeAllFilesList,
    ];
    logger.debug("updateProjectEditedFilesTar:", "tar", args.join(" "));
    const { stderr, exit_code } = await this.execInProject({
      command: "tar",
      args,
      err_on_exit: false,
    });
    if (exit_code) {
      logger.debug("WARNING -- updateProjectEditedFilesTar -- ", stderr);
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
    logger.debug("extractProjectEditedFilesInCompute", "tar", args.join(" "));
    try {
      await execa("tar", args, { cwd: this.upper });
    } catch (err) {
      logger.debug("WARNING -- extractProjectEditedFilesInCompute -- ", err);
    }
  };

  private execInProject = async (
    opts: ExecuteCodeOptions,
  ): Promise<ExecuteCodeOutput> => {
    logger.debug("execInProject:", `"${opts.command} ${opts.args?.join(" ")}"`);
    const api = await this.client.project_client.api(this.project_id);
    return await api.exec(opts);
  };
}
