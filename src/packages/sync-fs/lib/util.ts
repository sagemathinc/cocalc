import { dynamicImport } from "tsimportlib";
import { open } from "fs/promises";
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
  const { stdout } = await execa(
    "find",
    [".", ...findExclude(exclude), "-printf", "%P\n%C@\n"],
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

export async function createTarball(
  target: string,
  paths: string[],
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
  await execa("tar", args);
  return tarball;
}
