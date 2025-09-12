import { join } from "path";
import { data } from "@cocalc/backend/data";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { executeCode } from "@cocalc/backend/execute-code";
import { mkdir, rm, writeFile } from "fs/promises";
import { type Configuration } from "./types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { replace_all } from "@cocalc/util/misc";

const DEFAULT_IMAGE = "ubuntu:25.04";

const IMAGE_CACHE =
  process.env.COCALC_IMAGE_CACHE ?? join(data, "cache", "images");
const PROJECT_ROOTS =
  process.env.COCALC_PROJECT_ROOTS ?? join(data, "cache", "project-roots");

export const extractBaseImage = reuseInFlight(async (image: string) => {
  const baseImagePath = join(IMAGE_CACHE, image);
  const okFile = baseImagePath + ".ok";
  if (await exists(okFile)) {
    // already exist
    return baseImagePath;
  }
  // pull it -- this takes most of the time.
  // It is also important to do this before the unshare below,
  // since doing it inside the unshare hits namespace issues.
  await executeCode({
    timeout: 60 * 60, // in seconds
    err_on_exit: true,
    command: "podman",
    args: [
      // ignore_chown_errors=true is needed since otherwise we
      // have to make changes to the host system to allow more
      // uid's, etc. for complicated images (e.g., sage);
      // this is fine since we run everything as root anyways.
      "--storage-opt",
      "ignore_chown_errors=true",
      "pull",
      image,
    ],
  });
  // TODO: an optimization on COW filesystem if we pull one image
  // then pull another with a different tag, would be to start by
  // initializing the target path using COW, then 'rsync ... --delete'
  // to transform it to the result.  This could MASSIVELY save space.

  // extract the image
  try {
    await executeCode({
      verbose: true,
      timeout: 60 * 60, // timeout in seconds
      err_on_exit: true,
      command: "podman",
      args: [
        "unshare",
        "bash",
        "-c",
        `
  set -ev
  mnt="$(podman image mount ${image})"
  echo "mounted at: $mnt"
  mkdir -p "${baseImagePath}"
  rsync -aHx --numeric-ids --delete "$mnt"/ "${baseImagePath}"/
  podman image unmount ${image}
`,
      ],
    });
  } catch (err) {
    // fail -- clean up the mess (hopefully)
    try {
      await rm(baseImagePath, { force: true, recursive: true, maxRetries: 3 });
      await executeCode({ command: "podman", args: ["image", "rm", image] });
    } catch {}
    throw err;
  }
  // success!
  await writeFile(okFile, "");
  // remove the image to save space, in case it isn't used by
  // anything else.  we will not need it again, since we already
  // have a copy of it.
  await executeCode({ command: "podman", args: ["image", "rm", image] });
  return baseImagePath;
});

function getMergedPath(project_id) {
  return join(PROJECT_ROOTS, project_id);
}

function getPaths({ home, image, project_id }) {
  const userOverlays = join(home, ".overlay", image);
  const upperdir = join(userOverlays, "upperdir");
  const workdir = join(userOverlays, "workdir");
  const merged = getMergedPath(project_id);
  return { upperdir, workdir, merged };
}

function getImage(config) {
  return config?.image ?? DEFAULT_IMAGE;
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
  const image = getImage(config);
  const lowerdir = await extractBaseImage(image);
  const { upperdir, workdir, merged } = getPaths({ home, image, project_id });
  await mkdir(upperdir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(merged, { recursive: true });

  await mountOverlayFs({ lowerdir, upperdir, workdir, merged });

  return merged;
}

/*
This would go in sudo for the user to allow just this:

    wstein ALL=(ALL) NOPASSWD: /bin/mount -t overlay *, /bin/umount *
*/

export async function unmount(project_id: string) {
  const mountpoint = getMergedPath(project_id);
  await executeCode({
    verbose: true,
    err_on_exit: true,
    command: "sudo",
    args: ["umount", mountpoint],
  });
}

function escape(path) {
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
      `lowerdir=${escape(lowerdir)},upperdir=${escape(upperdir)},workdir=${escape(workdir)}`,
      merged,
    ],
  });
}
