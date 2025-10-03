/*
BTRFS Filesystem

DEVELOPMENT:

Start node, then:

DEBUG="cocalc:*file-server*" DEBUG_CONSOLE=yes node

a = require('@cocalc/file-server/btrfs'); fs = await a.filesystem({image:'/tmp/btrfs.img', mount:'/mnt/btrfs', size:'2G'})

*/

import refCache from "@cocalc/util/refcache";
import { mkdirp, btrfs, sudo, ensureMoreLoopbackDevices } from "./util";
import { Subvolumes } from "./subvolumes";
import { mkdir } from "fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import rustic from "@cocalc/backend/sandbox/rustic";
import { until } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

export interface Options {
  // mount = root mountpoint of the btrfs filesystem. If you specify the image
  // path below, then a btrfs filesystem will get automatically created (via sudo
  // and a loopback device).
  mount: string;

  // image = optionally use a image file at this location for the btrfs filesystem.
  // This is used for **development** (not a serious deployment).  It will be
  // created as a sparse image file
  // with given size, and mounted at opts.mount if it does not exist.  If you create
  // it be sure to use mkfs.btrfs to format it.
  image?: string;
  size?: string | number;

  // rustic = the rustic backups path.
  // If this path ends in .toml, it is the configuration file for rustic, e.g., you can
  // configure rustic however you want by pointing this at a toml cofig file.
  // Otherwise, if this path does not exist, it will be created a new rustic repo
  // initialized here.
  rustic: string;
}

let mountLock = false;

export class Filesystem {
  public readonly opts: Options;
  public readonly subvolumes: Subvolumes;

  constructor(opts: Options) {
    this.opts = opts;
    this.subvolumes = new Subvolumes(this);
  }

  init = async () => {
    await mkdirp([this.opts.mount]);
    await this.initDevice();
    await this.mountFilesystem();
    await this.sync();
    await btrfs({
      args: ["quota", "enable", "--simple", this.opts.mount],
    });
    await this.initRustic();
    await this.sync();
  };

  sync = async () => {
    await btrfs({ args: ["filesystem", "sync", this.opts.mount] });
  };

  unmount = async () => {
    await sudo({
      command: "umount",
      args: [this.opts.mount],
      err_on_exit: true,
    });
  };

  close = () => {};

  private initDevice = async () => {
    if (!this.opts.image) {
      return;
    }
    if (!(await exists(this.opts.image))) {
      // we create and format the sparse image
      await sudo({
        command: "truncate",
        args: ["-s", `${this.opts.size ?? "10G"}`, this.opts.image],
      });
      await sudo({ command: "mkfs.btrfs", args: [this.opts.image] });
    }
  };

  info = async (): Promise<{ [field: string]: string }> => {
    const { stdout } = await btrfs({
      args: ["subvolume", "show", this.opts.mount],
    });
    const obj: { [field: string]: string } = {};
    for (const x of stdout.split("\n")) {
      const i = x.indexOf(":");
      if (i == -1) continue;
      obj[x.slice(0, i).trim()] = x.slice(i + 1).trim();
    }
    return obj;
  };

  private mountFilesystem = async () => {
    try {
      await this.info();
      // already mounted
      return;
    } catch {}
    const { stderr, exit_code } = await this._mountFilesystem();
    if (exit_code) {
      throw Error(stderr);
    }
  };

  private _mountFilesystem = async () => {
    if (!this.opts.image) {
      throw Error(`there must be a btrfs image at ${this.opts.image}`);
    }
    await until(() => !mountLock);
    try {
      mountLock = true;
      const args: string[] = ["-o", "loop"];
      args.push(
        "-o",
        "compress=zstd",
        "-o",
        "noatime",
        "-o",
        "space_cache=v2",
        "-o",
        "autodefrag",
        this.opts.image,
        "-t",
        "btrfs",
        this.opts.mount,
      );
      {
        const { exit_code: failed } = await sudo({
          command: "mount",
          args,
          err_on_exit: false,
        });
        if (failed) {
          // try again with more loopback devices
          await ensureMoreLoopbackDevices();
          const { stderr, exit_code } = await sudo({
            command: "mount",
            args,
            err_on_exit: false,
          });
          if (exit_code) {
            return { stderr, exit_code };
          }
        }
      }
      await until(
        async () => {
          try {
            await sudo({
              command: "df",
              args: ["-t", "btrfs", this.opts.mount],
            });
            return true;
          } catch (err) {
            console.log(err);
            return false;
          }
        },
        { min: 250 },
      );
      const { stderr, exit_code } = await sudo({
        command: "chown",
        args: [
          `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
          this.opts.mount,
        ],
        err_on_exit: false,
      });
      return { stderr, exit_code };
    } finally {
      await delay(1000);
      mountLock = false;
    }
  };

  private initRustic = async () => {
    if (!this.opts.rustic) {
      throw Error("rustic repo path or toml must be specified");
    }
    if (!this.opts.rustic || (await exists(this.opts.rustic))) {
      return;
    }
    if (this.opts.rustic.endsWith(".toml")) {
      throw Error(`file not found: ${this.opts.rustic}`);
    }
    await mkdir(this.opts.rustic);
    await rustic(["init"], { repo: this.opts.rustic });
  };
}

const cache = refCache<Options & { noCache?: boolean }, Filesystem>({
  name: "btrfs-filesystems",
  createObject: async (options: Options) => {
    const filesystem = new Filesystem(options);
    await filesystem.init();
    return filesystem;
  },
});

export async function filesystem(
  options: Options & { noCache?: boolean },
): Promise<Filesystem> {
  return await cache(options);
}
