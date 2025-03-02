/*
Archiving and restore projects
*/

import { get, set } from "./db";
import { createSnapshot } from "./snapshots";
import { projectDataset, projectArchivePath, projectMountpoint } from "./names";
import { exec } from "./util";
import { join } from "path";
import { mountProject } from "./properties";

export async function dearchiveProject(opts) {
  const project = get(opts);
  if (!project.archived) {
    // nothing to do
    return project;
  }
  const { project_id, namespace } = project;
  // now we de-archive it:
  const archive = projectArchivePath(project);
  await exec({
    verbose: true,
    command: `cat ${join(archive, "latest.zfs")} | zfs recv ${projectDataset(project)}`,
    what: {
      project_id,
      namespace,
      desc: "de-archive a project via zfs recv",
    },
  });
  await mountProject(project);
  set({ project_id, namespace, archived: false });
}

export async function archiveProject(opts) {
  const project = get(opts);
  if (project.archived) {
    // nothing to do -- it is already archived
    return;
  }
  const { project_id, namespace } = project;
  // create or get most recent snapshot
  const snapshot = await createSnapshot(project);
  // where archive of this project goes in the filesystem:
  const archive = projectArchivePath(project);
  await exec({
    command: "sudo",
    args: ["mkdir", "-p", archive],
    what: { project_id, namespace, desc: "make archive target directory" },
  });
  // make full zfs send
  await exec({
    verbose: true,
    command: `zfs send -R ${projectDataset(project)}@${snapshot} > ${join(archive, "latest.zfs")}`,
    what: {
      project_id,
      namespace,
      desc: "zfs send of full project dataset to archive it",
    },
  });
  await mountProject(project);
  // make tarball
  await exec({
    verbose: true,
    command: `tar cf ${join(archive, "latest.tar")} ${join(projectMountpoint(project), ".zfs", "snapshot", snapshot)}`,
    what: {
      project_id,
      namespace,
      desc: "make full tarball of project for archive (just in case zfs send were corrupt)",
    },
  });
  // destroy dataset
  await exec({
    verbose: true,
    command: ["sudo"],
    args: ["destroy", "-r", projectDataset(project)],
    what: { project_id, namespace, desc: "destroying project dataset" },
  });
  // set as archived in database
  set({ project_id, namespace, archived: true });
}
