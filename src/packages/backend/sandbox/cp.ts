/*
Implement cp with same API as node, but using a spawned subprocess, because
Node's cp does NOT have reflink support, but we very much want it to get
the full benefit of btrfs's copy-on-write functionality.
*/

import exec from "./exec";
import { type CopyOptions } from "@cocalc/conat/files/fs";
export { type CopyOptions };
import { exists } from "./install";

export default async function cp(
  src: string[],
  dest: string,
  options: CopyOptions = {},
): Promise<void> {
  const args = [...src, dest];
  const opts: string[] = [];
  if (!options.dereference) {
    opts.push("-d");
  }
  if (!(options.force ?? true)) {
    // according to node docs, when force=true:
    //   "overwrite existing file or directory"
    // The -n (or --no-clobber) docs to cp: "do not overwrite an existing file",
    // so I think force=false is same as --update.
    if (options.errorOnExist) {
      // If moreover errorOnExist is set, then node's cp will also throw an error
      // with code "ERR_FS_CP_EEXIST"
      // SystemError [ERR_FS_CP_EEXIST]: Target already exists
      // /usr/bin/cp doesn't really have such an option, so we use exist directly.
      if (await exists(dest)) {
        const e = Error(
          "SystemError [ERR_FS_CP_EEXIST]: Target already exists",
        );
        // @ts-ignore
        e.code = "ERR_FS_CP_EEXIST";
        throw e;
      }
    }
    // silently does nothing if target exists
    opts.push("-n");
  }

  if (options.preserveTimestamps) {
    opts.push("-p");
  }
  if (options.recursive) {
    opts.push("-r");
  }
  if (options.reflink) {
    opts.push("--reflink=auto");
  }

  const { code, stderr } = await exec({
    cmd: "/usr/bin/cp",
    safety: [...opts, ...args],
    timeout: options.timeout,
  });
  if (code) {
    throw Error(stderr.toString());
  }
}
