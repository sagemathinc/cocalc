/*
Archiving and restore projects
*/

import { get, set } from "./db";
import { createSnapshot } from "./snapshots";
import { projectDataset, projectArchivePath, projectMountpoint } from "./names";
import { exec } from "./util";
import { join } from "path";
import { mountProject, zfsGetProperties } from "./properties";
import { delay } from "awaiting";
import { createBackup } from "./backup";

function streamPath(project) {
  const archive = projectArchivePath(project);
  const stream = join(archive, `${project.project_id}.zfs`);
  return stream;
}

export async function dearchiveProject(opts: {
  project_id: string;
  namespace?: string;
  // called during dearchive with status updates:
  progress?: (status: {
    // a number between 0 and 100 indicating progress
    progress: number;
    // estimated number of seconds remaining
    seconds_remaining?: number;
    // how much of the total data we have de-archived
    read?: number;
    // total amount of data to de-archive
    total?: number;
  }) => void;
}) {
  opts.progress?.({ progress: 0 });
  const project = get(opts);
  if (!project.archived) {
    throw Error("project is not archived");
  }
  const { project_id, namespace, used_by_dataset, used_by_snapshots } = project;
  const total = (used_by_dataset ?? 0) + (used_by_snapshots ?? 0);
  const dataset = projectDataset(project);
  let done = false;
  let progress = 0;
  if (opts.progress && total > 0) {
    (async () => {
      const t0 = Date.now();
      let lastProgress = 0;
      while (!done) {
        await delay(750);
        let x;
        try {
          x = await zfsGetProperties(dataset);
        } catch {
          // this is expected to fail, e.g., if filesystem doesn't exist yet.
        }
        if (done) {
          return;
        }
        const read = x.used_by_dataset + x.used_by_snapshots;
        progress = Math.min(100, Math.round((read * 100) / total));
        if (progress == lastProgress) {
          continue;
        }
        lastProgress = progress;
        let seconds_remaining: number | undefined = undefined;
        if (progress > 0) {
          const rate = (Date.now() - t0) / progress;
          seconds_remaining = Math.ceil((rate * (100 - progress)) / 1000);
        }
        opts.progress?.({ progress, seconds_remaining, total, read });
        if (progress >= 100) {
          break;
        }
      }
    })();
  }

  // now we de-archive it:
  const stream = streamPath(project);
  await exec({
    verbose: true,
    // have to use sudo sh -c because zfs recv only supports reading from stdin:
    command: `sudo sh -c 'cat ${stream} | zfs recv ${dataset}'`,
    what: {
      project_id,
      namespace,
      desc: "de-archive a project via zfs recv",
    },
  });
  done = true;
  if (progress < 100) {
    opts.progress?.({
      progress: 100,
      seconds_remaining: 0,
      total,
      read: total,
    });
  }
  await mountProject(project);
  // mounting worked so remove the archive
  await exec({
    command: "sudo",
    args: ["rm", stream],
    what: {
      project_id,
      namespace,
      desc: "removing the stream during de-archive",
    },
  });
  set({ project_id, namespace, archived: false });
}

export async function archiveProject(opts) {
  const project = get(opts);
  if (project.archived) {
    throw Error("project is already archived");
  }
  const { project_id, namespace } = project;
  // create or get most recent snapshot
  const snapshot = await createSnapshot({ ...project, ifChanged: true });
  // where archive of this project goes in the filesystem:
  const archive = projectArchivePath(project);
  const stream = streamPath(project);
  await exec({
    command: "sudo",
    args: ["mkdir", "-p", archive],
    what: { project_id, namespace, desc: "make archive target directory" },
  });
  // make full zfs send
  await exec({
    verbose: true,
    // have to use sudo sh -c because zfs send only supports writing to stdout:
    command: `sudo sh -c 'zfs send -R ${projectDataset(project)}@${snapshot} > ${stream}'`,
    what: {
      project_id,
      namespace,
      desc: "zfs send of full project dataset to archive it",
    },
  });
  // also make a bup backup
  await createBackup({ project_id, namespace });

  // destroy dataset
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "destroy", "-r", projectDataset(project)],
    what: { ...project, desc: "destroying project dataset" },
  });

  // set as archived in database
  set({ project_id, namespace, archived: true });

  // remove mountpoint -- should not have files in it
  await exec({
    command: "sudo",
    args: ["rmdir", projectMountpoint(project)],
    what: { ...project, desc: "remove mountpoint after archiving project" },
  });

  return { snapshot };
}
