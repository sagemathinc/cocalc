/*
Implementation of path sync *inside* volumes on the file server.

NOTE: I'm aware that we could use bind mounts instead of mutagen
to accomplish something very similar.  There are a huge list of pros
and cons to using mutagen versus bind mounts to solve this problem.
We've gone with mutagen, since it's entirely in user space (so maximally
flexible), and doesn't involve any cross filesystem mount issues.
Basically, for security it's better.

*/

import getLogger from "@cocalc/backend/logger";
import { executeCode } from "@cocalc/backend/execute-code";
import { join, resolve } from "node:path";
import { type Sync } from "@cocalc/conat/files/file-server";
import { type Filesystem } from "./filesystem";
import { sha1 } from "@cocalc/backend/sha1";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";

export const SYNC_STATE = "sync-state";

const logger = getLogger("file-server:btrfs:sync");

async function mutagen(
  args: string[],
  { HOME, err_on_exit = true }: { HOME: string; err_on_exit?: boolean },
) {
  return await executeCode({
    command: "mutagen",
    args: ["sync"].concat(args),
    verbose: true,
    err_on_exit,
    env: { ...process.env, HOME },
  });
}

// Return s a valid mutagen name, which will work no matter how long
// src and dest are (e.g., paths could be 1000+ characters),
// and can be deduced from src/dest with no database needed.
function mutagenName({ src, dest }: Sync): string {
  const s = parse(src);
  const d = parse(dest);
  return `fs-${sha1(JSON.stringify([s.name, s.path, d.name, d.path]))}`;
}

// spec is of the form  {volume-name}:{relative path into volume}
function parse(spec: string): { name: string; path: string } {
  const i = spec.indexOf(":");
  if (i == -1) {
    return { name: spec, path: "" };
  }
  const name = spec.slice(0, i);
  if (name.length > 63) {
    throw Error("volume name must be at most 63 characters long");
  }
  const path = spec.slice(i + 1);
  if (resolve("/", path).slice(1) != path) {
    throw Error(`invalid path ${path} -- must resolve to itself`);
  }
  return { name, path };
}

function parseSync(sync: Sync): {
  src: { name: string; path: string };
  dest: { name: string; path: string };
} {
  return { src: parse(sync.src), dest: parse(sync.dest) };
}

function encode({ name, path }: { name: string; path: string }) {
  return `${name}:${path}`;
}

// enhance MutagenSyncSession with extra data in the Sync object;
// This is a convenience function to connect mutagen's description
// of a sync session with the properties we use (src, dest, replica)
// to define one.
function addSync(session: MutagenSyncSession): Sync & MutagenSyncSession {
  return {
    ...session,
    src: encode({ name: session.labels?.src ?? "", path: session.alpha.path }),
    dest: encode({ name: session.labels?.dest ?? "", path: session.beta.path }),
    replica: session.mode == "one-way-replica",
  };
}

// all sync with this as the source

export class FileSync {
  constructor(public readonly fs: Filesystem) {}

  init = async () => {
    await this.mutagen(["daemon", "start"]);
  };

  close = async () => {
    try {
      await this.mutagen(["daemon", "stop"]);
    } catch (err) {
      console.warn("Error stopping mutagen daemon", err);
    }
  };

  private HOME?: string;
  private mutagen = async (args: string[], err_on_exit = true) => {
    if (!this.HOME) {
      this.HOME = (await this.fs.subvolumes.get(SYNC_STATE, true)).path;
    }
    return await mutagen(args, { HOME: this.HOME, err_on_exit });
  };

  create = async ({ ignores = [], ...sync }: Sync & { ignores?: string[] }) => {
    const cur = await this.get(sync);
    if (cur != null) {
      return;
    }
    logger.debug("create", sync);
    const { src, dest } = parseSync(sync);
    const srcVolume = await this.fs.subvolumes.get(src.name);
    const destVolume = await this.fs.subvolumes.get(dest.name);
    const alpha = join(srcVolume.path, src.path);
    const beta = join(destVolume.path, dest.path);
    const args = [
      "create",
      "--mode",
      // no possible conflicts:
      sync.replica ? "one-way-replica" : "two-way-resolved",
      "--label",
      `src=${src.name}`,
      "--label",
      `dest=${dest.name}`,
      `--name=${mutagenName(sync)}`,
      "--watch-polling-interval-alpha=10",
      "--watch-polling-interval-beta=10",
      "--symlink-mode=posix-raw",
    ];
    for (const ignore of Array.from(new Set(ignores))) {
      args.push(`--ignore=${ignore}`);
    }
    args.push(alpha, beta);
    await this.mutagen(args);
  };

  command = async (
    command: "flush" | "reset" | "pause" | "resume" | "terminate",
    sync: Sync,
  ) => {
    logger.debug("command: ", command, sync);
    return await this.mutagen([command, mutagenName(sync)]);
  };

  getAll = async ({
    name,
  }: {
    name: string;
  }): Promise<(Sync & MutagenSyncSession)[]> => {
    const { stdout } = await this.mutagen([
      "list",
      `--label-selector`,
      `src=${name}`,
      "--template",
      "{{json .}}",
    ]);
    const { stdout: stdout2 } = await this.mutagen([
      "list",
      `--label-selector`,
      `dest=${name}`,
      "--template",
      "{{json .}}",
    ]);
    const v = JSON.parse(stdout).concat(JSON.parse(stdout2));
    return v.map(addSync);
  };

  get = async (
    sync: Sync,
  ): Promise<undefined | (Sync & MutagenSyncSession)> => {
    const { stdout } = await this.mutagen(
      ["list", mutagenName(sync), "--template", "{{json .}}"],
      false,
    );
    if (!stdout.trim()) {
      return undefined; // doesn't exist
    }
    return addSync(JSON.parse(stdout)[0]);
  };
}
