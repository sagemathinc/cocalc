import { dynamicImport } from "tsimportlib";
import { readdir, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { compressFrame } from "lz4-napi";

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
  //   BUT -- we are assuming filenames can be encoded as utf8; if not, sync will
  //   obviously not work.
  // - The find output contains more than just what is needed for mtimeDirTree; it contains
  //   everything needed by websocketfs for doing stat, i.e., this output is used
  //   for the metadataFile functionality of websocketfs.
  // - Just a little fact -- output from find is NOT sorted in any guaranteed way.
  // Y2K alert -- note the %.10T below truncates times to integers, and will I guess fail a few hundred years from now.
  const topPaths = (await readdir(path)).filter(
    (p) => !p.startsWith(".") && !exclude.includes(p),
  );
  const { stdout } = await execa(
    "find",
    topPaths.concat([
      // This '-not -readable -prune -o ' excludes directories that we can read, since there is no possible
      // way to sync them, and a user (not root) might not be able to fix this.  See
      // https://stackoverflow.com/questions/762348/how-can-i-exclude-all-permission-denied-messages-from-find/25234419#25234419
      "-not",
      "-readable",
      "-prune",
      "-o",
      ...findExclude(exclude),
      "-printf",
      "%p\\0%.10T@ %.10A@ %b %s %M\\0\\0",
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
    const topPaths = (await readdir(path)).filter(
      (p) => !p.startsWith(".") && !exclude.includes(p),
    );
    const args = topPaths.concat([
      "-not", // '-not -readable -prune -o' - see comment in metadataFile
      "-readable",
      "-prune",
      "-o",
      ...findExclude(exclude),
      "-printf",
      "%p\\0%T@\\0\\0",
    ]);
    const { stdout } = await execa("find", [...args], {
      cwd: path,
    });
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
    v.push(path);
    v.push("-not");
    v.push("-path");
    v.push(`${path}/*`);
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

// Write a utf8 string to file with lz4 compression.
// We are not using streaming because lz4-napi doesn't
// support streams: https://github.com/antoniomuso/lz4-napi/issues/429
// But our actual use of this is for files that are fairly small,
// which got sent via an api call.
export async function writeFileLz4(path: string, contents: string) {
  // lz4-napi has no docs, but compressFrame works to create a file
  // that the lz4 command can decompress, but "compress" does not.
  const compressed = await compressFrame(Buffer.from(contents));
  await writeFile(path, compressed);
}

/*
Given an array paths of relative paths (relative to my HOME directory),
the function parseCommonPrefixes outputs an array of objects

{prefix:string; paths:string[]}

where prefix is a common path prefix of all the paths, and paths is what
is after that prefix.  Thus if the output is x, then

join(x[0].prefix, x[0].paths[0]), join(x[0].prefix, x[0].paths[1]), ..., join(x[x.length-1].prefix, x[x.length-1].paths[0]), ...

is exactly the original input string[] paths.
*/

export function parseCommonPrefixes(
  paths: string[],
): { prefix: string; paths: string[] }[] {
  // This function will slice the sorted path list into groups of paths having
  // the same prefix, create an object that contains the prefix and the rest of the
  // path for each group, and collect these objects into the result array. The rest
  // of the path is created by slicing the common prefix from the absolute path and
  // prepending '.' to get the relative path.

  // sort the paths to group common prefixes
  const sortedPaths = paths.slice().sort();
  const result: { prefix: string; paths: string[] }[] = [];

  let i = 0;
  while (i < sortedPaths.length) {
    const commonPrefix = dirname(sortedPaths[i]);
    let j = i + 1;

    // count the same prefixes
    while (j < sortedPaths.length && dirname(sortedPaths[j]) == commonPrefix) {
      j++;
    }

    // slice the paths with the same prefix and remove the prefix
    const subPaths = sortedPaths
      .slice(i, j)
      .map((p) => "." + p.slice(commonPrefix.length));

    result.push({ prefix: commonPrefix, paths: subPaths });

    i = j;
  }

  return result;
}
