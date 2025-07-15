/*
A BTRFS Filesystem

DEVELOPMENT:

Start node, then:

DEBUG="cocalc:*file-server*" DEBUG_CONSOLE=yes node

a = require('@cocalc/file-server/storage-btrfs'); fs = await a.filesystem({device:'/tmp/btrfs.img', formatIfNeeded:true, mount:'/mnt/btrfs', uid:293597964})

*/

import refCache from "@cocalc/util/refcache";
import { exists, isdir, listdir, mkdirp, rmdir, sudo } from "./util";
import { subvolume, type Subvolume } from "./subvolume";
import { SNAPSHOTS } from "./subvolume-snapshot";
import { join, normalize } from "path";

// default size of btrfs filesystem if creating an image file.
const DEFAULT_FILESYSTEM_SIZE = "10G";

// default for newly created subvolumes
export const DEFAULT_SUBVOLUME_SIZE = "1G";

const MOUNT_ERROR = "wrong fs type, bad option, bad superblock";

const RESERVED = new Set(["bup", "recv", "streams", SNAPSHOTS]);

export interface Options {
  // the underlying block device.
  // If this is a file (or filename) ending in .img, then it's a sparse file mounted as a loopback device.
  // If this starts with "/dev" then it is a raw block device.
  device: string;
  // formatIfNeeded -- DANGEROUS! if true, format the device or image,
  // if it doesn't mount with an error containing "wrong fs type,
  // bad option, bad superblock".  Never use this in production.  Useful
  // for testing and dev.
  formatIfNeeded?: boolean;
  // where the btrfs filesystem is mounted
  mount: string;

  // all subvolumes will have this owner
  uid?: number;

  // default size of newly created subvolumes
  defaultSize?: string | number;
  defaultFilesystemSize?: string | number;
}

export class Filesystem {
  public readonly opts: Options;
  public readonly bup: string;
  public readonly streams: string;

  constructor(opts: Options) {
    opts = {
      defaultSize: DEFAULT_SUBVOLUME_SIZE,
      defaultFilesystemSize: DEFAULT_FILESYSTEM_SIZE,
      ...opts,
    };
    this.opts = opts;
    this.bup = join(this.opts.mount, "bup");
    this.streams = join(this.opts.mount, "streams");
  }

  init = async () => {
    await mkdirp(
      [this.opts.mount, this.streams, this.bup].filter((x) => x) as string[],
    );
    await this.initDevice();
    await this.mountFilesystem();
    await sudo({ command: "chmod", args: ["a+rx", this.opts.mount] });
    await sudo({
      command: "btrfs",
      args: ["quota", "enable", "--simple", this.opts.mount],
    });
    await sudo({
      bash: true,
      command: `BUP_DIR=${this.bup} bup init`,
    });
  };

  private initDevice = async () => {
    if (!isImageFile(this.opts.device)) {
      // raw block device -- nothing to do
      return;
    }
    if (!(await exists(this.opts.device))) {
      await sudo({
        command: "truncate",
        args: ["-s", `${this.opts.defaultFilesystemSize}`, this.opts.device],
      });
    }
  };

  info = async (): Promise<{ [field: string]: string }> => {
    const { stdout } = await sudo({
      command: "btrfs",
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

  //
  private mountFilesystem = async () => {
    try {
      await this.info();
      // already mounted
      return;
    } catch {}
    const { stderr, exit_code } = await this._mountFilesystem();
    if (exit_code) {
      if (stderr.includes(MOUNT_ERROR)) {
        if (this.opts.formatIfNeeded) {
          await this.formatDevice();
          const { stderr, exit_code } = await this._mountFilesystem();
          if (exit_code) {
            throw Error(stderr);
          } else {
            return;
          }
        }
      }
      throw Error(stderr);
    }
  };

  private _mountFilesystem = async () => {
    const args: string[] = isImageFile(this.opts.device) ? ["-o", "loop"] : [];
    args.push(
      "-o",
      "compress=zstd",
      "-o",
      "noatime",
      "-o",
      "space_cache=v2",
      "-o",
      "autodefrag",
      this.opts.device,
      "-t",
      "btrfs",
      this.opts.mount,
    );
    return await sudo({
      command: "mount",
      args,
      err_on_exit: false,
    });
  };

  unmount = async () => {
    await sudo({
      command: "umount",
      args: [this.opts.mount],
      err_on_exit: true,
    });
  };

  private formatDevice = async () => {
    await sudo({ command: "mkfs.btrfs", args: [this.opts.device] });
  };

  close = () => {
    // nothing, yet
  };

  subvolume = async (name: string): Promise<Subvolume> => {
    if (RESERVED.has(name)) {
      throw Error(`${name} is reserved`);
    }
    return await subvolume({ filesystem: this, name });
  };

  // create a subvolume by cloning an existing one.
  cloneSubvolume = async (source: string, name: string) => {
    if (RESERVED.has(name)) {
      throw Error(`${name} is reserved`);
    }
    if (!(await exists(join(this.opts.mount, source)))) {
      throw Error(`subvolume ${source} does not exist`);
    }
    if (await exists(join(this.opts.mount, name))) {
      throw Error(`subvolume ${name} already exists`);
    }
    await sudo({
      command: "btrfs",
      args: [
        "subvolume",
        "snapshot",
        join(this.opts.mount, source),
        join(this.opts.mount, source, name),
      ],
    });
    await sudo({
      command: "mv",
      args: [join(this.opts.mount, source, name), join(this.opts.mount, name)],
    });
    const snapdir = join(this.opts.mount, name, SNAPSHOTS);
    if (await exists(snapdir)) {
      const snapshots = await listdir(snapdir);
      await rmdir(
        snapshots.map((x) => join(this.opts.mount, name, SNAPSHOTS, x)),
      );
    }
    const src = await this.subvolume(source);
    const vol = await this.subvolume(name);
    const { size } = await src.usage();
    if (size) {
      await vol.size(size);
    }
    return vol;
  };

  deleteSubvolume = async (name: string) => {
    await sudo({
      command: "btrfs",
      args: ["subvolume", "delete", join(this.opts.mount, name)],
    });
  };

  list = async (): Promise<string[]> => {
    const { stdout } = await sudo({
      command: "btrfs",
      args: ["subvolume", "list", this.opts.mount],
    });
    return stdout
      .split("\n")
      .map((x) => x.split(" ").slice(-1)[0])
      .filter((x) => x)
      .sort();
  };

  rsync = async ({
    src,
    target,
    args = ["-axH"],
    timeout = 5 * 60 * 1000,
  }: {
    src: string;
    target: string;
    args?: string[];
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exit_code: number }> => {
    let srcPath = normalize(join(this.opts.mount, src));
    if (!srcPath.startsWith(this.opts.mount)) {
      throw Error("suspicious source");
    }
    let targetPath = normalize(join(this.opts.mount, target));
    if (!targetPath.startsWith(this.opts.mount)) {
      throw Error("suspicious target");
    }
    if (!srcPath.endsWith("/") && (await isdir(srcPath))) {
      srcPath += "/";
      if (!targetPath.endsWith("/")) {
        targetPath += "/";
      }
    }
    return await sudo({
      command: "rsync",
      args: [...args, srcPath, targetPath],
      err_on_exit: false,
      timeout: timeout / 1000,
    });
  };
}

function isImageFile(name: string) {
  if (name.startsWith("/dev")) {
    return false;
  }
  // TODO: could probably check os for a device with given name?
  return name.endsWith(".img");
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
