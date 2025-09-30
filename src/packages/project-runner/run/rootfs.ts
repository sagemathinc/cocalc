/*
Privileges: This uses sudo to do an overlayfs mount.

    wstein ALL=(ALL) NOPASSWD: /bin/mount -t overlay *, /bin/umount *

where obviously wstein is replaced by the user running this server.
*/

import { join } from "path";
import { data } from "@cocalc/backend/data";
import { executeCode } from "@cocalc/backend/execute-code";
import { mkdir, rm } from "fs/promises";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { replace_all } from "@cocalc/util/misc";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import { getImage } from "./podman";
import { extractBaseImage, IMAGE_CACHE, registerProgress } from "./rootfs-base";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:overlay");

const PROJECT_ROOTS =
  process.env.COCALC_PROJECT_ROOTS ?? join(data, "cache", "project-roots");

function getMergedPath(project_id) {
  return join(PROJECT_ROOTS, project_id);
}

export function getPaths({ home, image, project_id, compute_server_id = 0 }): {
  lowerdir: string;
  upperdir: string;
  workdir: string;
  merged: string;
} {
  const userOverlays = join(
    home,
    PROJECT_IMAGE_PATH,
    `${compute_server_id}`,
    image,
  );
  const upperdir = join(userOverlays, "upperdir");
  const workdir = join(userOverlays, "workdir");
  const merged = getMergedPath(project_id);
  const lowerdir = join(IMAGE_CACHE, image);
  return { lowerdir, upperdir, workdir, merged };
}

export async function mount({
  project_id,
  home,
  config,
}: {
  project_id: string;
  home: string;
  config?: Configuration;
}) {
  bootlog({
    project_id,
    type: "mount-rootfs",
    progress: 0,
    desc: "",
  });

  const image = getImage(config);
  logger.debug("mount", { project_id, home, image });

  registerProgress(image, ({ progress, desc }) => {
    bootlog({
      project_id,
      type: "mount-rootfs",
      progress: (progress / 100) * 70, // normalize to go from 0 to 70
      desc,
    });
  });

  const lowerdir = await extractBaseImage(image);

  bootlog({
    project_id,
    type: "mount-rootfs",
    progress: 70,
    desc: "extracted base image",
  });
  const { upperdir, workdir, merged } = getPaths({ home, image, project_id });
  try {
    // workdir must be empty when mount happens -- it is scratch space
    await rm(workdir, { recursive: true, force: true });
  } catch {}
  await mkdir(upperdir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(merged, { recursive: true });
  bootlog({
    project_id,
    type: "mount-rootfs",
    progress: 80,
    desc: "created directories",
  });
  await mountOverlayFs({ lowerdir, upperdir, workdir, merged });
  bootlog({
    project_id,
    type: "mount-rootfs",
    progress: 100,
    desc: "mounted",
  });

  return merged;
}

export async function unmount(project_id: string) {
  const mountpoint = getMergedPath(project_id);
  try {
    await executeCode({
      verbose: true,
      err_on_exit: true,
      command: "sudo",
      args: ["umount", "-l", mountpoint],
    });
  } catch (err) {
    const e = `${err}`;
    if (e.includes("not mounted") || e.includes("no mount point")) {
      // if it isn't mounted or the mountpoint doesn't even exist
      return;
    }
    throw err;
  }
}

export function escape(path) {
  return replace_all(path, ":", `\\:`);
}

async function mountOverlayFs({ upperdir, workdir, merged, lowerdir }) {
  await executeCode({
    verbose: true,
    err_on_exit: true,
    command: "sudo",
    args: [
      "mount",
      "-t",
      "overlay",
      "overlay",
      "-o",
      // CRITICAL: using xino=off,metacopy=off,redirect_dir=off disables all use of xattrs,
      // so we can rsync rootfs in a purely rootless context.  It is much LESS efficient
      // if users are modifying big base layer file metadata or deleting a lot of base
      // image directories... but that's not at all the likely use case of our overlay filesystem.
      // Much more likely is that users place data and new software installs in the rootfs.
      `lowerdir=${escape(lowerdir)},upperdir=${escape(upperdir)},workdir=${escape(workdir)},xino=off,metacopy=off,redirect_dir=off`,
      merged,
    ],
  });
}
