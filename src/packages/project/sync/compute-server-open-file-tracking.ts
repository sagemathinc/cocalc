/*
Manage the state of open files in the compute servers syncdb sync'd file.

TODO: terminals aren't handled at all here, since they don't have a syncdoc.
*/

import type { SyncDocs } from "./sync-doc";
import type { SyncDB } from "@cocalc/sync/editor/db/sync";
import { once } from "@cocalc/util/async-utils";
import { auxFileToOriginal } from "@cocalc/util/misc";
import { terminalTracker } from "@cocalc/terminal";
import { getLogger } from "@cocalc/backend/logger";
import { syncdbPath, JUPYTER_SYNCDB_EXTENSIONS } from "@cocalc/util/jupyter/names";

const log = getLogger("project:sync:compute-file-tracker").debug;

export default async function computeServerOpenFileTracking(
  syncDocs: SyncDocs,
  compute: SyncDB,
) {
  log("initialize");
  if (compute.get_state() != "ready") {
    log("wait for compute server syncdoc to be ready...");
    await once(compute, "ready");
  }

  const getOpenPaths = () => {
    const v = syncDocs.getOpenPaths().concat(terminalTracker.getOpenPaths());
    log("getOpenPaths", v);
    return new Set(v);
  };
  const isOpen = (path: string): boolean => {
    return syncDocs.isOpen(path) || terminalTracker.isOpen(path);
  };

  // Initialize -- get all open paths and update syncdb state to reflect this correctly.
  const openPaths = getOpenPaths();
  for (const { path, open } of compute.get().toJS()) {
    const syncdocPath = computePathToSyncDocPath(path);
    const isOpen = openPaths.has(syncdocPath);
    log("init ", { path, open, syncdocPath, isOpen });
    if (open != isOpen) {
      log("init ", "changing state of ", { path });
      compute.set({ path, open: isOpen });
    }
  }
  compute.commit();

  // Watch for files being opened or closed or paths being added/removed from syncdb
  const handleOpen = (path: string) => {
    log("handleOpen", { path });
    if (compute.get_state() == "closed") {
      syncDocs.removeListener("open", handleOpen);
      return;
    }
    // A path was opened. If it is in the syncdb, then mark it as opened there.
    const x = compute.get_one({ path: syncDocPathToComputePath(path) });
    if (x != null) {
      compute.set({ path: syncDocPathToComputePath(path), open: true });
      compute.commit();
    }
  };
  syncDocs.on("open", handleOpen);
  terminalTracker.on("open", handleOpen);

  const handleClose = (path: string) => {
    log("handleClose", { path });
    if (compute.get_state() == "closed") {
      syncDocs.removeListener("open", handleClose);
      return;
    }
    // A path was closed. If it is in the syncdb, then mark it as closed there.
    const x = compute.get_one({ path: syncDocPathToComputePath(path) });
    if (x != null) {
      compute.set({ path: syncDocPathToComputePath(path), open: false });
      compute.commit();
    }
  };

  syncDocs.on("close", handleClose);
  // terminals currently don't get closed, but we include this anyways so
  // it will "just work" when we do implement that.
  terminalTracker.on("close", handleClose);

  // keys is an immutablejs Set of {path} objects
  const handleComputeChange = (keys) => {
    // The compute server table that tracks where things should run changed.
    // If any path was added to that tabl, make sure its open state is correct.
    const keyList = keys.toJS();
    log("handleComputeChange", { keyList });
    let n = 0;
    for (const { path } of keyList) {
      const x = compute.get_one({ path });
      if (x == null) {
        // path was REMOVED
        log("handleComputeChange: removed", { path });
        continue;
      }
      // path was added or changed in some way -- make sure it agrees
      const open = isOpen(computePathToSyncDocPath(path));
      if (x.get("open") != open) {
        log("handleComputeChange -- making change:", { path, open });
        compute.set({ path, open });
        n += 1;
      }
    }
    if (n > 0) {
      compute.commit();
    }
  };

  compute.on("change", handleComputeChange);
}

function syncDocPathToComputePath(path: string): string {
  if (path.endsWith("." + JUPYTER_SYNCDB_EXTENSIONS)) {
    return auxFileToOriginal(path);
  }
  return path;
}

function computePathToSyncDocPath(path: string): string {
  if (path.endsWith(".ipynb")) {
    return syncdbPath(path);
  }
  return path;
}
