import getLogger from "@cocalc/backend/logger";
import { executeCode } from "@cocalc/backend/execute-code";
import { join, resolve } from "node:path";
import { type Sync } from "@cocalc/conat/files/file-server";
import { type Filesystem } from "./filesystem";
import { sha1 } from "@cocalc/backend/sha1";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";

const logger = getLogger("file-server:btrfs:sync");

async function mutagen(args: string[], err_on_exit = true) {
  return await executeCode({
    command: "mutagen",
    args: ["sync"].concat(args),
    verbose: true,
    err_on_exit,
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

function addSync(session: MutagenSyncSession): Sync & MutagenSyncSession {
  return {
    ...session,
    src: encode({ name: session.labels?.src ?? "", path: session.alpha.path }),
    dest: encode({ name: session.labels?.dest ?? "", path: session.beta.path }),
  };
}

// all sync with this as the source

export class FileSync {
  constructor(public readonly fs: Filesystem) {}

  create = async (sync: Sync) => {
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
      "two-way-resolved",
      "--label",
      `src=${src.name}`,
      "--label",
      `dest=${dest.name}`,
      `--name=${mutagenName(sync)}`,
      alpha,
      beta,
    ];
    await mutagen(args);
  };

  terminate = async (sync: Sync) => {
    logger.debug("terminate", sync);
    await mutagen(["terminate", mutagenName(sync)]);
  };

  flush = async (sync: Sync) => {
    logger.debug("flush", sync);
    await mutagen(["flush", mutagenName(sync)]);
  };

  pause = async (sync: Sync) => {
    logger.debug("pause", sync);
    await mutagen(["pause", mutagenName(sync)]);
  };

  resume = async (sync: Sync) => {
    logger.debug("resume", sync);
    await mutagen(["resume", mutagenName(sync)]);
  };

  getAll = async ({
    name,
  }: {
    name: string;
  }): Promise<(Sync & MutagenSyncSession)[]> => {
    const { stdout } = await mutagen([
      "list",
      `--label-selector`,
      `src=${name}`,
      "--template",
      "{{json .}}",
    ]);
    const { stdout: stdout2 } = await mutagen([
      "list",
      `--label-selector`,
      `dest=${name}`,
      "--template",
      "{{json .}}",
    ]);
    const v = JSON.parse(stdout).conat(JSON.parse(stdout2));
    return v.map(addSync);
  };

  get = async (
    sync: Sync,
  ): Promise<undefined | (Sync & MutagenSyncSession)> => {
    const { stdout } = await mutagen(
      ["list", mutagenName(sync), "--template", "{{json .}}"],
      false,
    );
    if (!stdout.trim()) {
      return undefined; // doesn't exist
    }
    return addSync(JSON.parse(stdout)[0]);
  };
}
