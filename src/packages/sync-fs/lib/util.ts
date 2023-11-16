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

// IMPORTANT: top level hidden subdirectories in path are always ignored, e.g.,
// if path is /home/user, then /home/user/.foo is ignored, but /home/user/bar/.foo
// is not ignored.
export async function metadataFile({
  path,
  exclude,
}: {
  path: string;
  exclude: string[];
}): Promise<string> {
  log("mtimeDirTree", path, exclude);
  if (!(await exists(path))) {
    return "";
  }
  // Recursively get enough metadata about all non-hidden top level path trees
  // (this is VASTLY more efficient
  // than "find . ...", especially on cocalc with it's fuse mounted .snapshots!)
  // Notes about the find output option to printf:
  // - We use null characters as separators because they are the ONLY character
  //   that isn't allowed in a filename (besides '/')! Filenames can have newlines
  //   in them!
  // - The find output contains more than just what is needed for mtimeDirTree; it contains
  //   everything needed by websocketfs for doing stat, i.e., this output is used
  //   for the metadataFile functionality of websocketfs.
  // - Just a little fact -- output from find is NOT sorted in any guaranteed way.
  const topPaths = (await readdir(path)).filter((p) => !p.startsWith("."));
  const { stdout } = await execa(
    "find",
    topPaths.concat([
      ...findExclude(exclude),
      "-printf",
      "%p\\0%T@ %A@ %b %s %M\\0\\0",
    ]),
    {
      cwd: path,
    },
  );
  return stdout;
}

// Compute the map from paths to their integral mtime for the entire directory tree
// NOTE: this could also be done with the walkdir library, but using find
// is several times faster in general. This is *the* bottleneck, and the
// subprocess IO isn't much, so calling find as a subprocess is the right
// solution!  This is not a hack at all.
// IMPORTANT: top level hidden subdirectories in path are always ignored
export async function mtimeDirTree({
  path,
  exclude,
  metadataFile,
}: {
  path: string;
  exclude: string[];
  metadataFile?: string;
}): Promise<{ [path: string]: number }> {
  log("mtimeDirTree", path, exclude);
  if (!(await exists(path))) {
    return {};
  }
  // If the string metadataFile is passed in (as output from metadataFile), then we use that
  // If it isn't, then we compute just what is needed here.
  if (metadataFile == null) {
    const topPaths = (await readdir(path)).filter((p) => !p.startsWith("."));
    const { stdout } = await execa(
      "find",
      topPaths.concat([...findExclude(exclude), "-printf", "%p\\0%T@\\0\\0"]),
      {
        cwd: path,
      },
    );
    metadataFile = stdout;
  }
  const c: { [path: string]: number } = {};
  const v = metadataFile.split("\0\0");
  for (const record of v) {
    if (!record) continue; // trailing blank line of file
    const [path, meta] = record.split("\0");
    if (path.startsWith(".")) {
      // never include top level hidden paths, if they are there for some reason.
      continue;
    }
    // NOTE -- GNU tar discards fractional part of timestamp, thus rounding down,
    // so this is right, since we will use tar for sending files.
    c["./" + path] = parseInt(meta.split(" ")[0]);
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
