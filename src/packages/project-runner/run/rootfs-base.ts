import { join } from "path";
import { data } from "@cocalc/backend/data";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { executeCode } from "@cocalc/backend/execute-code";
import { rm, writeFile } from "fs/promises";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:rootfs-base");

export const IMAGE_CACHE =
  process.env.COCALC_IMAGE_CACHE ?? join(data, "cache", "images");

type ProgressFunction = (opts: { progress: number; desc: string }) => void;

// This is a bit complicated because extractBaseImage uses reuseInFlight,
// and it's actually very likely MULTIPLE projects will start and need
// to extract an image at the same time, so they should all see the progress
// updates together.
const progressWatchers: { [image: string]: ProgressFunction[] } = {};
export function registerProgress(image: string, f: ProgressFunction) {
  if (progressWatchers[image] == null) {
    progressWatchers[image] = [f];
  } else {
    progressWatchers[image].push(f);
  }
}

export const extractBaseImage = reuseInFlight(async (image: string) => {
  logger.debug("extractBaseImage", { image });
  const reportProgress = (x: { progress: number; desc: string }) => {
    for (const f of progressWatchers[image] ?? []) {
      f(x);
    }
  };
  try {
    const baseImagePath = join(IMAGE_CACHE, image);
    const okFile = baseImagePath + ".ok";
    reportProgress({ progress: 0, desc: `checking for ${image}...` });
    if (await exists(okFile)) {
      // already exist
      reportProgress({ progress: 100, desc: `${image} available` });
      return baseImagePath;
    }
    reportProgress({ progress: 5, desc: `pulling ${image}...` });
    // pull it -- this takes most of the time.
    // It is also important to do this before the unshare below,
    // since doing it inside the unshare hits namespace issues.
    try {
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
    } catch (err) {
      reportProgress({ progress: 100, desc: `pulling ${image} failed` });
      throw err;
    }
    reportProgress({ progress: 50, desc: `extracting ${image}...` });

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
      reportProgress({
        progress: 80,
        desc: `cleaning up ${image}...`,
      });
    } catch (err) {
      // fail -- clean up the mess (hopefully)
      reportProgress({
        progress: 90,
        desc: "image extract failed: cleaning up",
      });
      try {
        await rm(baseImagePath, {
          force: true,
          recursive: true,
          maxRetries: 3,
        });
        await executeCode({ command: "podman", args: ["image", "rm", image] });
      } catch {}
      reportProgress({ progress: 100, desc: `extracting ${image} failed` });
      throw err;
    }
    // success!
    await writeFile(okFile, "");
    // remove the image to save space, in case it isn't used by
    // anything else.  we will not need it again, since we already
    // have a copy of it.
    await executeCode({ command: "podman", args: ["image", "rm", image] });
    reportProgress({ progress: 100, desc: `pulled and extracted ${image}` });
    return baseImagePath;
  } finally {
    delete progressWatchers[image];
  }
});
