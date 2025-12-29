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
  parseOutput,
  parseAndValidateOptions,
  validate,
} from "./exec";
import { rustic as rusticPath } from "./install";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "path";
import { rusticRepo } from "@cocalc/backend/data";
import LRU from "lru-cache";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("sandbox:rustic");

export interface RusticOptions {
  repo?: string;
  timeout?: number;
  maxSize?: number;
  safeAbsPath?: (path: string) => Promise<string>;
  host?: string;
  cwd?: string;
}

export default async function rustic(
  args: string[],
  options: RusticOptions,
): Promise<ExecOutput> {
  const {
    timeout,
    maxSize,
    repo = rusticRepo,
    safeAbsPath,
    host = "host",
  } = options;

  const common = getCommonArgs(repo);
  await ensureInitialized(repo);
  const cwd = await safeAbsPath?.(options.cwd ?? "");

  const run = async (sanitizedArgs: string[]) => {
    return await exec({
      cmd: rusticPath,
      cwd,
      safety: [...common, args[0], ...sanitizedArgs],
      maxSize,
      timeout,
    });
  };

  switch (args[0]) {
    case "init": {
      if (safeAbsPath != null) {
        throw Error("init not allowed");
      }
      return await run([]);
    }
    case "backup": {
      if (safeAbsPath == null || cwd == null) {
        throw Error("safeAbsPath must be specified when making a backup");
      }
      if (args.length == 1) {
        throw Error("missing backup source");
      }
      const source = (await safeAbsPath(args.slice(-1)[0])).slice(cwd.length);
      const options = parseAndValidateOptions(
        args.slice(1, -1),
        whitelist.backup,
      );

      return await run([
        ...options,
        "--no-scan",
        "--host",
        host,
        "--",
        source ? source : ".",
      ]);
    }
    case "snapshots": {
      const options = parseAndValidateOptions(
        args.slice(1),
        whitelist.snapshots,
      );
      return await run([...options, "--filter-host", host]);
    }
    case "ls": {
      if (args.length <= 1) {
        throw Error("missing <SNAPSHOT[:PATH]>");
      }
      const snapshot = args.slice(-1)[0]; // <SNAPSHOT[:PATH]>
      await assertValidSnapshot({ snapshot, host, repo });
      const options = parseAndValidateOptions(args.slice(1, -1), whitelist.ls);
      return await run([...options, snapshot]);
    }
    case "restore": {
      if (args.length <= 2) {
        throw Error("missing <SNAPSHOT[:PATH]>");
      }
      if (safeAbsPath == null) {
        throw Error("safeAbsPath must be specified when restoring");
      }
      const snapshot = args.slice(-2)[0]; // <SNAPSHOT[:PATH]>
      await assertValidSnapshot({ snapshot, host, repo });
      const destination = await safeAbsPath(args.slice(-1)[0]); // <destination>
      const options = parseAndValidateOptions(
        args.slice(1, -2),
        whitelist.restore,
      );
      return await run([...options, snapshot, destination]);
    }
    case "find": {
      const options = parseAndValidateOptions(args.slice(1), whitelist.find);
      return await run([...options, "--filter-host", host]);
    }
    case "forget": {
      if (args.length == 2 && !args[1].startsWith("-")) {
        // delete exactly id
        const snapshot = args[1];
        await assertValidSnapshot({ snapshot, host, repo });
        return await run([snapshot]);
      }
      // delete several defined by rules.
      const options = parseAndValidateOptions(args.slice(1), whitelist.forget);
      return await run([...options, "--filter-host", host]);
    }
    default:
      throw Error(`subcommand not allowed: ${args[0]}`);
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
  restore: {
    "--delete": true,
    "--verify-existing": true,
    "--recursive": true,
    "-h": true,
    "--help": true,
    "--glob": validate.str,
    "--iglob": validate.str,
  },
  ls: {
    "-s": true,
    "--summary": true,
    "-l": true,
    "--long": true,
    "--json": true,
    "--recursive": true,
    "-h": true,
    "--help": true,
    "--glob": validate.str,
    "--iglob": validate.str,
  },
  find: {
    "--glob": validate.str,
    "--iglob": validate.str,
    "--path": validate.str,
    "-g": validate.str,
    "--group-by": validate.str,
    "--all": true,
    "--show-misses": true,
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
  forget: {
    "--json": true,
    "-g": validate.str,
    "--group-by": validate.str,
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
    "--keep-tags": validate.str,
    "--keep-id": validate.str,
    "-l": validate.int,
    "--keep-last": validate.int,
    "-M": validate.int,
    "--keep-minutely": validate.int,
    "-H": validate.int,
    "--keep-hourly": validate.int,
    "-d": validate.int,
    "--keep-daily": validate.int,
    "-w": validate.int,
    "--keep-weekly": validate.int,
    "-m": validate.int,
    "--keep-monthly": validate.int,
    "--keep-quarter-yearly": validate.int,
    "--keep-half-yearly": validate.int,
    "-y": validate.int,
    "--keep-yearly": validate.int,
    "--keep-within": validate.str,
    "--keep-within-minutely": validate.str,
    "--keep-within-hourly": validate.str,
    "--keep-within-daily": validate.str,
    "--keep-within-weekly": validate.str,
    "--keep-within-monthly": validate.str,
    "--keep-within-quarter-yearly": validate.str,
    "--keep-within-half-yearly": validate.str,
    "--keep-within-yearly": validate.str,
    "--keep-none": validate.str,
  },
} as const;

function getCommonArgs(repo: string) {
  if (repo.endsWith(".toml")) {
    // in case of toml, the password should be in the toml file
    return ["-P", repo.slice(0, -5)];
  }
  // not using a config file is insecure and only for dev purposes, since
  // seeing ps gives away password, so we don't have any way to set it.
  return ["--password", "", "-r", repo];
}

export async function ensureInitialized(repo: string) {
  const common = getCommonArgs(repo);
  await ensureInitializedWithCommon(repo, common);
}

async function ensureInitializedWithCommon(repo: string, common: string[]) {
  if (repo.endsWith(".toml")) {
    try {
      parseOutput(
        await exec({
          cmd: rusticPath,
          safety: [...common, "repoinfo"],
          timeout: 30_000,
        }),
      );
      logger.debug("ensureInitializedWithCommon - repo is initialized");
      return;
    } catch {
      logger.debug("ensureInitializedWithCommon - initializing");
      parseOutput(
        await exec({
          cmd: rusticPath,
          safety: ["--no-progress", ...common, "init"],
          timeout: 30_000,
        }),
      );
      logger.debug("ensureInitializedWithCommon - initialiszing");
      return;
    }
  }
  const config = join(repo, "config");
  if (!(await exists(config))) {
    logger.debug("ensureInitializedWithCommon - initializing locally");
    parseOutput(
      await exec({
        cmd: rusticPath,
        safety: ["--no-progress", ...common, "init"],
        timeout: 30_000,
      }),
    );
    logger.debug(
      "ensureInitializedWithCommon - successfully initialized locally",
    );
  }
}

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
  // Robust parsing: rustic snapshots --json <id> currently returns an array of
  // objects like:
  // [
  //   {
  //     group_key: { hostname: "...", ... },
  //     snapshots: [ { hostname: "...", ... }, ... ]
  //   }
  // ]
  // Older versions emitted: [ [ group_key, [ { hostname, ... } ] ] ]
  // Support both shapes and error clearly otherwise.
  const hostname =
    info?.[0]?.snapshots?.[0]?.hostname ?? info?.[0]?.[1]?.[0]?.hostname;
  if (!hostname) {
    throw new Error(`snapshot ${opts.id} not found or missing hostname`);
  }
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
  const common = getCommonArgs(repo);
  const { stdout } = await exec({
    cmd: rusticPath,
    safety: [...common, "snapshots", "--json", id],
  });
  if (!stdout) {
    throw Error(`no snapshot with id ${id}`);
  }
  try {
    return JSON.parse(stdout.toString());
  } catch {
    throw Error(`no snapshot with id ${id}`);
  }
}
