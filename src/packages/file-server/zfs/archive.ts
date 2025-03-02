/*
Archiving and restore projects
*/

import { get, set } from "./db";
import { createSnapshot } from "./snapshots";
import { projectDataset, projectArchivePath, projectMountpoint } from "./names";
import { exec } from "./util";
import { join } from "path";
import { mountProject } from "./properties";

export async function restoreProject(opts) {
  const project = get(opts);
  if (!project.archived) {
    // nothing to do
    return project;
  }
  // now we de-archive it:
  throw Error("TODO:  de-archive project here and return that");
}

export async function archiveProject(opts) {
  const project = get(opts);
  if (project.archived) {
    // nothing to do -- it is already archived
    return;
  }
  // create or get most recent snapshot
  const snapshot = await createSnapshot(project);
  // where archive of this project goes in the filesystem:
  const archive = await projectArchivePath(project);
  await exec({
    command: "sudo",
    args: ["mkdir", "-p", archive],
  });
  // make full zfs send
  await exec({
    verbose: true,
    command: `zfs send -R ${projectDataset(project)}@${snapshot} > ${join(archive, snapshot + ".zfs")}`,
  });
  // make tarball
  await mountProject(project);
  await exec({
    verbose: true,
    command: `tar cf ${join(archive, snapshot + ".tar")} ${join(projectMountpoint(project), ".zfs", "snapshot", snapshot)}`,
  });
  // destroy dataset
  await exec({
    verbose: true,
    command: ["sudo"],
    args: ["destroy", "-r", projectDataset(project)],
  });
  // set as archived in database
  const { project_id, namespace } = project;
  set({ project_id, namespace, archived: true });
}
