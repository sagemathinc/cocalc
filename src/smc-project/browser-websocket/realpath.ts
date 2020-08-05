// path is assumed relative to the HOME directory
// return value is also relative to HOME directory -- if it is
// a symlink to something outside of the HOME directory, we just
// return the input!  This is used for sync so this is the best
// we can do for now (see https://github.com/sagemathinc/cocalc/issues/4732)
import { realpath as fs_realpath } from "fs";
import { callback } from "awaiting";

// SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
const HOME = process.env.SMC_LOCAL_HUB_HOME ?? process.env.HOME;

export async function realpath(path: string): Promise<string> {
  const fullpath = HOME + "/" + path;
  const rpath = await callback(fs_realpath, fullpath);
  if (rpath == fullpath || !rpath.startsWith(HOME + "/")) {
    return path;
  }
  return rpath.slice((HOME + "/").length);
}
