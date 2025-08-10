/*
Implement cp with same API as node, but using a spawned subprocess, because
Node's cp does NOT have reflink support, but we very much want it to get
the full benefit of btrfs's copy-on-write functionality.
*/

import exec from "./exec";
import { type CopyOptions } from "@cocalc/conat/files/fs";
export { type CopyOptions };

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
    if (options.errorOnExist) {
      opts.push("--update=none-fail");
    } else {
      opts.push("--update=none");
    }
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
