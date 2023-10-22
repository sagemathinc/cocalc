import { dynamicImport } from "tsimportlib";
//import getLogger from "@cocalc/backend/logger";
//const log = getLogger("compute:filesystem-cache").debug;
const log = console.log;

export async function execa(cmd, args, options?) {
  log("execa", cmd, args.join(" "), options);
  const { execa: execa0 } = (await dynamicImport(
    "execa",
    module,
  )) as typeof import("execa");
  return await execa0(cmd, args, options);
}

// Compute the map from paths to their ctime for the entire directory tree
// NOTE: this could also be done with the walkdir library, but using find
// is several times faster in general. This is *the* bottlekneck, and the
// subprocess IO isn't much, so calling find as a subprocess is the right
// solution!  This is not a hack at all.
export async function ctimeMsDirTree({
  path,
  exclude,
}: {
  path: string;
  exclude: string[];
}): Promise<{ [path: string]: number }> {
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
    c[v[i]] = parseFloat(v[i + 1]) * 1000;
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
