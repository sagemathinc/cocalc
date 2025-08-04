/*
Whitelist:

The idea is that
   - the client can only work with snapshots with exactly the given host.
   - any snapshots they create have that host
   - snapshots are only of data in their sandbox
   - snapshots can only be restored to their sandbox

The subcommands with some whitelisted support are:

   - backup
   - snapshots
   - ls
   - restore
   - find
   - forget

The source options are relative paths and the command is run from the
root of the sandbox_path.

    rustic backup --host=sandbox_path [whitelisted options]... [source]...

    rustic snapshots --filter-host=... [whitelisted options]...


Here the snapshot id will be checked to have the right host before
the command is run. Destination is relative to sandbox_path.

    rustic restore [whitelisted options] <snapshot_id:path> <destination>


Dump is used for viewing a version of a file via timetravel:

    rustic dump <snapshot_id:path>

Find is used for getting info about all versions of a file that are backed up:

    rustic find  --filter-host=...

    rustic find --filter-host=...  --glob='foo/x.txt' -h


Delete snapshots:

- delete snapshot with specific id, which must have the specified host.

    rustic forget [id]

-


*/

import exec, {
  type ExecOutput,
  parseAndValidateOptions,
  validate,
} from "./exec";
import { rustic as rusticPath } from "./install";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "path";
import { rusticRepo } from "@cocalc/backend/data";
import LRU from "lru-cache";

export interface RusticOptions {
  repo?: string;
  timeout?: number;
  maxSize?: number;
  safeAbsPath: (path: string) => Promise<string>;
  host: string;
}

export default async function rustic(
  args: string[],
  options: RusticOptions,
): Promise<ExecOutput> {
  const { timeout, maxSize, repo = rusticRepo, safeAbsPath, host } = options;

  await ensureInitialized(repo);
  const base = await safeAbsPath("");

  const common = ["--password", "", "-r", repo];

  const run = async (sanitizedArgs: string[]) => {
    return await exec({
      cmd: rusticPath,
      cwd: base,
      safety: [...common, ...sanitizedArgs],
      maxSize,
      timeout,
    });
  };

  if (args[0] == "backup") {
    if (args.length == 1) {
      throw Error("missing backup source");
    }
    const source = (await safeAbsPath(args.slice(-1)[0])).slice(base.length);
    const options = parseAndValidateOptions(
      args.slice(1, -1),
      whitelist.backup,
    );

    return await run([
      "backup",
      ...options,
      "--no-scan",
      "--host",
      host,
      "--",
      source,
    ]);
  } else if (args[0] == "snapshots") {
    const options = parseAndValidateOptions(args.slice(1), whitelist.snapshots);
    return await run(["snapshots", ...options, "--filter-host", host]);
  } else if (args[0] == "ls") {
    if (args.length <= 1) {
      throw Error("missing <SNAPSHOT[:PATH]>");
    }
    const snapshot = args.slice(-1)[0]; // <SNAPSHOT[:PATH]>
    await assertValidSnapshot({ snapshot, host, repo });
    const options = parseAndValidateOptions(args.slice(1, -1), whitelist.ls);
    return await run(["ls", ...options, snapshot]);
  } else {
    throw Error(`subcommand not allowed: ${args[0]}`);
  }
}

async function ensureInitialized(repo: string) {
  if (!(await exists(join(repo, "config")))) {
    await exec({
      cmd: rusticPath,
      safety: ["--password", "", "-r", repo, "init"],
    });
  }
}

const whitelist = {
  backup: {
    "--label": validate.str,
    "--tag": validate.str,
    "--description": validate.str,
    "--time": validate.str,
    "--delete-after": validate.str,
    "--as-path": validate.str,
    "--with-atime": true,
    "--ignore-devid": true,
    "--json": true,
    "--long": true,
    "--quiet": true,
    "-h": true,
    "--help": true,
    "--glob": validate.str,
    "--iglob": validate.str,
    "--git-ignore": true,
    "--no-require-git": true,
    "-x": true,
    "--one-file-system": true,
    "--exclude-larger-than": validate.str,
  },
  snapshots: {
    "-g": validate.str,
    "--group-by": validate.str,
    "--long": true,
    "--json": true,
    "--all": true,
    "-h": true,
    "--help": true,
    "--filter-label": validate.str,
    "--filter-paths": validate.str,
    "--filter-paths-exact": validate.str,
    "--filter-after": validate.str,
    "--filter-before": validate.str,
    "--filter-size": validate.str,
    "--filter-size-added": validate.str,
    "--filter-jq": validate.str,
  },
  restore: {},
  ls: {
    "-s": true,
    "--summary": true,
    "-l": true,
    "--long": true,
    "--json": true,
    "--numeric-uid-gid": true,
    "--recursive": true,
    "-h": true,
    "--help": true,
    "--glob": validate.str,
    "--iglob": validate.str,
  },
} as const;

async function assertValidSnapshot({ snapshot, host, repo }) {
  const id = snapshot.split(":")[0];
  if (id == "latest") {
    // possible race condition so do not allow
    throw Error("latest is not allowed");
  }
  const actualHost = await getHost({ id, repo });
  if (actualHost != host) {
    throw Error(
      `host for snapshot with id ${id} must be '${host}' but it is ${actualHost}`,
    );
  }
}

// we do not allow changing host so this is safe to cache.
const hostCache = new LRU<string, string>({
  max: 10000,
});

export async function getHost(opts) {
  if (hostCache.has(opts.id)) {
    return hostCache.get(opts.id);
  }
  const info = await getSnapshot(opts);
  const hostname = info[0][1][0]["hostname"];
  hostCache.set(opts.id, hostname);
  return hostname;
}

export async function getSnapshot({
  id,
  repo = rusticRepo,
}: {
  id: string;
  repo?: string;
}) {
  const { stdout } = await exec({
    cmd: rusticPath,
    safety: ["--password", "", "-r", repo, "snapshots", "--json", id],
  });
  return JSON.parse(stdout.toString());
}
