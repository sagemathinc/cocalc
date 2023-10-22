/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Compute Server Filesystem Sync

ALGORITHM:

Periodically sync a compute server and the project as follows.  This will result in the filesystems
being equal if there is no activity for a few seconds.

- In the project, we must track all deletes.  We have an in memory data structure:

     project_deletes = {[path:string]:time when file was deleted}.

  This can be done using polling, inotify, periodic scans, whatever, but MUST be done.  Sync is
  provably impossible without it.  If a file is deleted then created later, it can be removed
  from the deletes map to save memory, but doesn't have to be.

- The actual sync works as follows.  We could do this periodically, or triggered by filesystem activity.

  1. In the compute server, make a map from all paths in upper (both directories and files and whiteouts),
  except ones excluded from sync, to the ctime for the path (or negative ctime for deleted paths):

      computeState = {[path:string]:ctime of last change to file metadata}

  2. Send computeState to the project via the api (via the project websocket).  The project iterates
  over each path and decides if any of the following apply:

     - delete on compute
     - delete on project
     - copy from project to compute
     - copy from compute to project

  The decision about which is based on knowing the ctime of that path on compute, in the project,
  and whether or not the file was deleted (and when) on both sides.  We know all this information
  for each path, so we *can* make this decision.  It is tricky for directories and files in them,
  but the information is all there, so we can make the decision.  If there is a conflict, we resolve it
  by "last timestamp wins, with preference to the project in case of a tie".   Note also that all
  ctimes are defined and this all happens on local filesystems (not websocketfs).   It's also possible
  to just decide not to do anything regarding a given path and wait until later, which is critical
  since we do not have point in time snapshots; if a file is actively being changed, we just wait until
  next time to deal with it.

  The above results in four maps from paths to ctime (which is taken from the latest ctime when
  deciding the above, in each case).

     - delete_on_compute
     - delete_on_project
     - copy_from_project_to_compute
     - copy_from_compute_to_project

  These are handled as follows:

    - We directly do delete_on_project immediately (we can also add these to the project_deletes map,
      in case that tracking has some lag).
    - We return delete_on_compute as part of the response from the api call.
    - We create a tarball ~/.compute-servers/[id]/copy_from_project_to_compute.tar.xz (say)
      containing the files in copy_from_project_to_compute.  It's of course critical that
      nothing in here is corrupted; if there is any "file was modified" during making the
      tarball, we remove it.  We return that there is at least 1 file in this tarball
      and the path to the tarball from the api call.
    - We return a list of the the files in copy_from_compute_to_project as well in the
      api call response.

  The api call returns with the above information in it.  The compute server then does the following:

    - Deletes all files in upper and whiteout listed in delete_on_compute, but always checking
      if there was more recent activity on a path, in which case it doesn't.
    - Extracts the tarball lower/.compute-servers/[id]/copy_from_project_to_compute.tar.xz
      to upper with the option set to not overwrite newer files.
    - Creates a tarball of the files in copy_from_compute_to_project, with similar care as mentioned
      above to not have any corrupted files in here.  Basically, we can tar, and if there are any messages
      about files modified during tar, remove them (e.g.,  tar --delete -f nixtree.tar  textfile1.txt).
          lower/.compute-serers/[id]/copy_from_compute_to_project.tar.xz
    - Makes API call to the project telling it to extract copy_from_compute_to_project.tar.xz, not
      overwriting newer files.

Discussion:

If we do the above and there is no filesystem activity, then the two filesystems will be in sync.
If there is activity, some files will be missed, but they will get picked up during a subsequent sync,
because there is absolutely no assumption that a previous round of sync did anything in particular!
The underlying networked filesystem (websocketfs) is ONLY used for sending the two tarballs, which
means they can be arbitrarily large, and also means that very high latency of that filesystem is
fine, and all that matters is bandwidth.

Complementary to the above, we also have read file tracking for websocketfs.  Using that we periodically
copy a tarball of files over from the project and extract them to upper, in order to make local reads
much faster.

*/

import walkdir from "walkdir";
import { join } from "path";
import { execa } from "execa";

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

  private getComputeState = async (
    implementation: "find" | "walkdir" = "find",
  ) => {
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
