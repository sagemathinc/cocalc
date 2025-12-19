/*
Privileges: This uses sudo to do an overlayfs mount.

    wstein ALL=(ALL) NOPASSWD: /bin/mount -t overlay *, /bin/umount *

where obviously wstein is replaced by the user running this server.
*/

import { join } from "path";
import { data } from "@cocalc/backend/data";
import { executeCode } from "@cocalc/backend/execute-code";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { replace_all } from "@cocalc/util/misc";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import { getImage } from "./podman";
import { extractBaseImage, IMAGE_CACHE, registerProgress } from "./rootfs-base";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:overlay");
const UNMOUNT_DELAY_MS = Number(
  process.env.COCALC_SANDBOX_UNMOUNT_DELAY_MS ?? 30_000,
);

const PROJECT_ROOTS =
  process.env.COCALC_PROJECT_ROOTS ?? join(data, "cache", "project-roots");

function getMergedPath(project_id) {
  return join(PROJECT_ROOTS, project_id);
}

export function getImageNamePath(home): string {
  return join(home, PROJECT_IMAGE_PATH, "current-image.txt");
}

export function getPaths({ home, image, project_id }): {
  lowerdir: string;
  upperdir: string;
  workdir: string;
  merged: string;
  imageName: string;
} {
  const userOverlays = join(home, PROJECT_IMAGE_PATH, image);
  const upperdir = join(userOverlays, "upperdir");
  const workdir = join(userOverlays, "workdir");
  const merged = getMergedPath(project_id);
  const lowerdir = join(IMAGE_CACHE, image);
  const imageName = getImageNamePath(home);
  return { lowerdir, upperdir, workdir, merged, imageName };
}

// Track mount reference counts so multiple users (e.g., project container +
// sandboxExec sidecars) can share the same overlay mount safely.
const mountRefs: Map<string, number> = new Map();
// When refcount drops to 0, we delay the actual unmount so bursty users don't
// churn overlay mounts. mount() cancels any pending unmount.
const unmountTimers: Map<string, NodeJS.Timeout> = new Map();
// Serialize mount/unmount per project to avoid races with delayed unmounts.
const mountLocks: Map<string, Promise<void>> = new Map();

async function withLock<T>(
  project_id: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = mountLocks.get(project_id) ?? Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((res) => {
    release = res;
  });
  mountLocks.set(project_id, current);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (mountLocks.get(project_id) === current) {
      mountLocks.delete(project_id);
    }
  }
}

// isMounted -- returns true if the overlayfs for this project
// is already mounted.
export async function isMounted({
  project_id,
}: {
  project_id: string;
}): Promise<boolean> {
  const mountpoint = getMergedPath(project_id);
  try {
    const mounts = await readFile("/proc/self/mountinfo", "utf8");
    return mounts.split("\n").some((line) => {
      if (!line) return false;
      const fields = line.split(" ");
      // mountinfo columns: see `man proc`; mountpoint is field 5 (0-based index 4).
      return fields[4] === mountpoint;
    });
  } catch (err) {
    logger.debug("isMounted: failed to read mountinfo", { error: `${err}` });
    return false;
  }
}

// mount the project -- this is idempotent, so can be called even if already mounted.
export async function mount({
  project_id,
  home,
  config,
}: {
  project_id: string;
  home: string;
  config?: Configuration;
}) {
  return await withLock(project_id, async () => {
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
        progress,
        max: 70,
        desc,
      });
    });

    // uses the above registerProgress
    const lowerdir = await extractBaseImage(image);

    bootlog({
      project_id,
      type: "mount-rootfs",
      progress: 70,
      desc: "extracted base image",
    });
    const { upperdir, workdir, merged, imageName } = getPaths({
      home,
      image,
      project_id,
    });

    // If a delayed unmount was pending, cancel it because we're reusing the mount.
    const pending = unmountTimers.get(project_id);
    if (pending) {
      clearTimeout(pending);
      unmountTimers.delete(project_id);
    }

    if (await isMounted({ project_id })) {
      // Already mounted; bump ref count (or initialize if this process was restarted).
      const prev = mountRefs.get(project_id) ?? 0;
      mountRefs.set(project_id, prev + 1);
      return merged;
    }

    try {
      // workdir must be empty when mount happens -- it is scratch space
      await rm(workdir, { recursive: true, force: true });
    } catch {}
    await mkdir(upperdir, { recursive: true });
    await mkdir(workdir, { recursive: true });
    await mkdir(merged, { recursive: true });

    // Persist image info for later lookup (e.g., ephemeral exec when the container is stopped).
    await writeFile(imageName, image);

    bootlog({
      project_id,
      type: "mount-rootfs",
      progress: 80,
      desc: "created directories",
    });
    await mountOverlayFs({ lowerdir, upperdir, workdir, merged });
    mountRefs.set(project_id, 1);
    bootlog({
      project_id,
      type: "mount-rootfs",
      progress: 100,
      desc: "mounted",
    });

    return merged;
  });
}

export async function unmount(project_id: string) {
  const mountpoint = getMergedPath(project_id);
  await withLock(project_id, async () => {
    const refs = mountRefs.get(project_id) ?? 1;
    if (refs > 1) {
      mountRefs.set(project_id, refs - 1);
      return;
    }

    // Drop to zero and schedule a delayed unmount. If the mount is reused before
    // the timeout fires, mount() will clear this timer and bump the refcount.
    mountRefs.set(project_id, 0);
    const existing = unmountTimers.get(project_id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      void withLock(project_id, async () => {
        if ((mountRefs.get(project_id) ?? 0) > 0) return;
        try {
          await executeCode({
            verbose: true,
            err_on_exit: true,
            command: "sudo",
            args: ["umount", "-l", mountpoint],
          });
          // Only clear ref state if still zero.
          if ((mountRefs.get(project_id) ?? 0) === 0) {
            mountRefs.delete(project_id);
          }
        } catch (err) {
          const e = `${err}`;
          if (e.includes("not mounted") || e.includes("no mount point")) {
            return;
          }
          logger.warn("unmount failed", { project_id, error: e });
        } finally {
          unmountTimers.delete(project_id);
        }
      });
    }, UNMOUNT_DELAY_MS);
    unmountTimers.set(project_id, timer);
  });
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
