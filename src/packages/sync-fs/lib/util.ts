import { dynamicImport } from "tsimportlib";
import { readdir, rm } from "fs/promises";
import { join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";

import getLogger from "@cocalc/backend/logger";
const log = getLogger("sync-fs:util").debug;

export async function execa(cmd, args, options?) {
  log("execa", cmd, "...", args?.slice(-15)?.join(" "), options);
  const { execa: execa0 } = (await dynamicImport(
    "execa",
    module,
  )) as typeof import("execa");
  return await execa0(cmd, args, options);
}

// Compute the map from paths to their integral mtime for the entire directory tree
// NOTE: this could also be done with the walkdir library, but using find
// is several times faster in general. This is *the* bottleneck, and the
// subprocess IO isn't much, so calling find as a subprocess is the right
// solution!  This is not a hack at all.

// IMPORTANT: top level hidden subdirectories in path are always ignored, e.g.,
// if path is /home/user, then /home/user/.foo is ignored, but /home/user/bar/.foo
// is not ignored.
export async function mtimeDirTree({
  path,
  exclude,
}: {
  path: string;
  exclude: string[];
}): Promise<{ [path: string]: number }> {
  log("mtimeDirTree", path, exclude);
  if (!(await exists(path))) {
    return {};
  }
  // get the non-hidden top level files/paths (this is much more efficient
  // than "find .")
  const topPaths = (await readdir(path)).filter((p) => !p.startsWith("."));
  const { stdout } = await execa(
    "find",
    topPaths.concat([...findExclude(exclude), "-printf", "%p\n%T@\n"]),
    {
      cwd: path,
    },
  );
  const c: { [path: string]: number } = {};
  const v = stdout.split("\n");
  for (let i = 0; i < v.length - 1; i += 2) {
    // NOTE -- GNU tar discards fractional part, thus rounding down, so this is right, since
    // we will use tar for sending files.
    c["./" + v[i]] = parseInt(v[i + 1]);
  }
  return c;
}

function findExclude(exclude: string[]): string[] {
  const v: string[] = [];
  // We run "find *", not "find .", so no need to exclude hidden files here.
  // Also, doing it here instead of with "find *" is massively slower in general!
  for (const path of exclude) {
    v.push("-not");
    v.push("-path");
    v.push(`./${path}`);
    v.push("-not");
    v.push("-path");
    v.push(`./${path}/*`);
  }
  return v;
}

export async function remove(paths: string[], rel?: string) {
  if (!rel) {
    throw Error("rel must be defined");
  }
  // TODO/guess -- by sorting we remove files in directory, then containing directory (?).
  for (const path of paths.sort().reverse()) {
    try {
      await rm(join(rel, path), { recursive: true });
    } catch (err) {
      log(`WARNING: issue removing '${path}' -- ${err}`);
    }
  }
}
