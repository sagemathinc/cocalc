import { dynamicImport } from "tsimportlib";
import { open, rm } from "fs/promises";
import { join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";

import getLogger from "@cocalc/backend/logger";
const log = getLogger("sync-fs:util").debug;

export async function execa(cmd, args, options?) {
  log("execa", cmd, args.join(" "), options);
  const { execa: execa0 } = (await dynamicImport(
    "execa",
    module,
  )) as typeof import("execa");
  return await execa0(cmd, args, options);
}

// Compute the map from paths to their integral mtime for the entire directory tree
// NOTE: this could also be done with the walkdir library, but using find
// is several times faster in general. This is *the* bottlekneck, and the
// subprocess IO isn't much, so calling find as a subprocess is the right
// solution!  This is not a hack at all.
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
  const { stdout } = await execa(
    "find",
    [".", ...findExclude(exclude), "-printf", "%P\n%T@\n"],
    {
      cwd: path,
    },
  );
  const c: { [path: string]: number } = {};
  const v = stdout.split("\n");
  for (let i = 0; i < v.length - 1; i += 2) {
    // NOTE -- GNU tar discards fractional part, thus rounding down, so this is right, since
    // we will use tar for sending files.
    c[v[i]] = parseInt(v[i + 1]);
  }
  return c;
}

function findExclude(exclude: string[]): string[] {
  const v = ["-not", "-path", "."];
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

// [ ] TODO: we have to remove any files that got changed while the tarball
// was getting created!
/*
  stderr:
    'tar: cocalc/.git/objects/pack: file changed as we read it\n' +
    'tar: cocalc/.git: file changed as we read it\n' +
    'tar: cocalc: file changed as we read it\n' +
    'tar: cocalc/.git/objects/pack/tmp_pack_N9Q9Gf: Cannot stat: No such file or directory\n' +
    'tar: Exiting with failure status due to previous errors',
*/
export async function createTarball(
  target: string,
  paths: string[],
  cwd: string,
): Promise<string> {
  log("createTarball: ", target, " paths.length = ", paths.length);
  const file = await open(target, "w");
  await file.write(paths.join("\n"));
  await file.close();

  const tarball = target + ".tar.xz";
  const args = [
    "-zcf",
    tarball,
    "--verbatim-files-from",
    "--files-from",
    target,
  ];
  await execa("tar", args, { cwd });
  return tarball;
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
