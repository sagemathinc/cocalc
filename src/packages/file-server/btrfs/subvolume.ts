/*
A subvolume
*/

import { type Filesystem } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import { join } from "path";
import { mkdir } from "fs/promises";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { SubvolumeRustic } from "./subvolume-rustic";
import { SubvolumeSnapshots } from "./subvolume-snapshots";
import { SubvolumeQuota } from "./subvolume-quota";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { btrfs, sudo } from "./util";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:btrfs:subvolume");

interface Options {
  filesystem: Filesystem;
  name: string;
}

export class Subvolume {
  public readonly name: string;
  public readonly filesystem: Filesystem;
  public readonly path: string;
  public readonly fs: SandboxedFilesystem;
  public readonly rustic: SubvolumeRustic;
  public readonly snapshots: SubvolumeSnapshots;
  public readonly quota: SubvolumeQuota;

  constructor({ filesystem, name }: Options) {
    this.filesystem = filesystem;
    this.name = name;
    this.path = join(filesystem.opts.mount, name);
    this.fs = new SandboxedFilesystem(this.path, {
      rusticRepo: filesystem.opts.rustic,
      host: this.name,
    });
    this.rustic = new SubvolumeRustic(this);
    this.snapshots = new SubvolumeSnapshots(this);
    this.quota = new SubvolumeQuota(this);
  }

  init = async () => {
    if (await exists(this.path)) {
      const isSubvolume = await isBtrfsSubvolume(this.path);
      if (!isSubvolume) {
        throw new Error(
          `existing path is not a btrfs subvolume: ${this.path}`,
        );
      }
    }
    if (!(await exists(this.path))) {
      logger.debug(`creating ${this.name} at ${this.path}`);
      await btrfs({
        args: ["subvolume", "create", this.path],
      });
      await this.chown(this.path);
    }
    await this.ensureQgroup();
    await this.ensureSnapshotsDir();
  };

  getSubvolumeId = async (): Promise<number> => {
    return await getSubvolumeId(this.path);
  };

  close = () => {
    // @ts-ignore
    delete this.filesystem;
    // @ts-ignore
    delete this.name;
    // @ts-ignore
    delete this.path;
    // @ts-ignore
    delete this.snapshotsDir;
    for (const sub of ["fs", "rustic", "snapshots", "quota"]) {
      this[sub].close?.();
      delete this[sub];
    }
  };

  private chown = async (path: string) => {
    await sudo({
      command: "chown",
      args: [`${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`, path],
    });
  };

  private ensureQgroup = async () => {
    const id = await this.getSubvolumeId();
    const tryCreate = async () => {
      await btrfs({ args: ["qgroup", "create", `1/${id}`, this.path] });
    };
    try {
      await tryCreate();
    } catch (err: any) {
      const stderr =
        typeof err?.stderr === "string"
          ? err.stderr
          : `${err?.message ?? err}`;
      if (stderr.includes("quota not enabled")) {
        // quotas are disabled on the mount; enable and retry once
        await btrfs({
          args: ["quota", "enable", this.filesystem.opts.mount],
        });
        await tryCreate().catch((retryErr: any) => {
          const retryStderr =
            typeof retryErr?.stderr === "string"
              ? retryErr.stderr
              : `${retryErr?.message ?? retryErr}`;
          if (retryStderr.toLowerCase().includes("exist")) {
            return;
          }
          throw retryErr;
        });
      } else if (stderr.toLowerCase().includes("exist")) {
        return;
      } else {
        throw err;
      }
    }
  };

  private ensureSnapshotsDir = async () => {
    const dir = join(this.path, SNAPSHOTS);
    if (await exists(dir)) return;
    await mkdir(dir, { recursive: true });
  };
}

export async function isBtrfsSubvolume(path: string): Promise<boolean> {
  const { exit_code, stderr } = await btrfs({
    args: ["subvolume", "show", path],
    err_on_exit: false,
    verbose: false,
  });
  if (!exit_code) return true;
  if (typeof stderr === "string" && stderr.includes("Not a Btrfs subvolume")) {
    return false;
  }
  throw new Error(`btrfs subvolume show failed for ${path}: ${stderr}`);
}

const cache = refCache<Options & { noCache?: boolean }, Subvolume>({
  name: "btrfs-subvolumes",
  createKey: ({ name }) => name,
  createObject: async (options: Options) => {
    const subvolume = new Subvolume(options);
    return subvolume;
  },
});

export async function subvolume(
  options: Options & { noCache?: boolean },
): Promise<Subvolume> {
  return await cache(options);
}

export async function getSubvolumeField(
  path: string,
  field: string,
): Promise<string> {
  const { stdout } = await btrfs({
    args: ["subvolume", "show", path],
    verbose: false,
  });
  // Avoid relying on positional splits; scan lines for the field name.
  const re = new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`, "im");
  const match = stdout.match(re);
  if (!match?.[1]) {
    throw new Error(`field '${field}' not found in btrfs show output for ${path}`);
  }
  return match[1].trim();
}

export async function getSubvolumeId(path: string): Promise<number> {
  return parseInt(await getSubvolumeField(path, "Subvolume ID"));
}
