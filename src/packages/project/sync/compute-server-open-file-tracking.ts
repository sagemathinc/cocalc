/*
Manage the state of open files in the compute servers syncdb sync'd file.

TODO: terminals aren't handled at all here, since they don't have a syncdoc.
*/

import type { SyncDocs } from "./sync-doc";
import type { SyncDB } from "@cocalc/sync/editor/db/sync";
import { once } from "@cocalc/util/async-utils";
import { meta_file, auxFileToOriginal } from "@cocalc/util/misc";

export default async function computeServerOpenFileTracking(
  syncDocs: SyncDocs,
  compute: SyncDB,
) {
  if (compute.get_state() != "ready") {
    await once(compute, "ready");
  }
  // Initialize -- get all open paths and update syncdb state to reflect this correctly.
  const openPaths = new Set(syncDocs.getOpenPaths());
  for (const { path, open } of compute.get().toJS()) {
    const isOpen = openPaths.has(computePathToSyncDocPath(path));
    if (open != isOpen) {
      compute.set({ path, open: isOpen });
    }
  }
  compute.commit();

  // Watch for files being opened or closed or paths being added/removed from syncdb
  const handleOpen = (path: string) => {
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

  const handleClose = (path: string) => {
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

  // keys is an immutablejs Set of {path} objects
  const handleComputeChange = (keys) => {
    // The syncdb changed. If any path was added, make sure its open
    // state is correct.
    let n = 0;
    for (const { path } of keys.toJS()) {
      const x = compute.get_one({ path });
      if (x != null) {
        compute.set({
          path,
          open: syncDocs.isOpen(computePathToSyncDocPath(path)),
        });
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
  if (path.endsWith(".sage-jupyter2")) {
    return auxFileToOriginal(path);
  }
  return path;
}

function computePathToSyncDocPath(path: string): string {
  if (path.endsWith(".ipynb")) {
    return meta_file(path, "jupyter2");
  }
  return path;
}
