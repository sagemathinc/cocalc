/*
A BTRFS Filesystem

DEVELOPMENT:

Start node, then:

a = require('@cocalc/file-server/storage-btrfs'); fs = await a.filesystem({device:'/tmp/btrfs.img', formatIfNeeded:true, mount:'/mnt/btrfs', uid:293597964})

*/

import refCache from "@cocalc/util/refcache";
import { exists, mkdirp, sudo } from "@cocalc/file-server/storage-zfs/util";
import { subvolume } from "./subvolume";
import { join } from "path";

// default size of btrfs filesystem if creating an image file.
const DEFAULT_FILESYSTEM_SIZE = "10G";

// default for newly created subvolumes
export const DEFAULT_SUBVOLUME_SIZE = "1G";

const MOUNT_ERROR = "wrong fs type, bad option, bad superblock";

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
  // path where btrfs send streams of subvolumes are stored (using "btrfs send")
  streams?: string;
  // path where bup backups of subvolumes are stored
  bup?: string;

  // all subvolumes will have this owner
  uid?: number;

  // default size of newly created subvolumes
  defaultSize?: string | number;
  defaultFilesystemSize?: string | number;
}

export class Filesystem {
  public readonly opts: Options;

  constructor(opts: Options) {
    opts = {
      defaultSize: DEFAULT_SUBVOLUME_SIZE,
      defaultFilesystemSize: DEFAULT_FILESYSTEM_SIZE,
      ...opts,
    };
    this.opts = opts;
  }

  init = async () => {
    await mkdirp(
      [this.opts.mount, this.opts.streams, this.opts.bup].filter(
        (x) => x,
      ) as string[],
    );
    await this.initDevice();
    await this.mountFilesystem();
    await sudo({ command: "chmod", args: ["a+rx", this.opts.mount] });
    await sudo({
      command: "btrfs",
      args: ["quota", "enable", "--simple", this.opts.mount],
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

  info = async () => {
    return await sudo({
      command: "btrfs",
      args: ["subvolume", "show", this.opts.mount],
    });
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

  private formatDevice = async () => {
    await sudo({ command: "mkfs.btrfs", args: [this.opts.device] });
  };

  close = () => {
    // nothing, yet
  };

  subvolume = async (name: string) => {
    return await subvolume({ filesystem: this, name });
  };

  deleteSubvolume = async (name: string) => {
    await sudo({ command: "btrfs", args: ["subvolume", "delete", name] });
  };

  list = async (): Promise<string[]> => {
    const { stdout } = await sudo({
      command: "btrfs",
      args: ["subvolume", "list", this.opts.mount],
    });
    return stdout
      .split("\n")
      .map((x) => x.split(" ").slice(-1)[0])
      .filter((x) => x);
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
    const srcPath = join(this.opts.mount, src);
    const targetPath = join(this.opts.mount, target);
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
