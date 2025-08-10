/*
Implement cp with same API as node, but using a spawned subprocess, because
Node's cp does NOT have reflink support, but we very much want it to get
the full benefit of btrfs's copy-on-write functionality.
*/

import exec from "./exec";

export default async function cp(
  src: string[],
  dest: string,
  options: {
    dereference?: boolean;
    errorOnExist?: boolean;
    force?: boolean;
    preserveTimestamps?: boolean;
    recursive?: boolean;
    verbatimSymlinks?: boolean;
  } = {},
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

  const { code, stderr } = await exec({
    cmd: "/usr/bin/cp",
    safety: [...opts, ...args],
  });
  if (code) {
    throw Error(stderr.toString());
  }
}
