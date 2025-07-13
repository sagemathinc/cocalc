import {
  filesystem,
  type Filesystem,
} from "@cocalc/file-server/storage-btrfs/filesystem";
import process from "node:process";

export let fs: Filesystem;

export async function before() {
  fs = await filesystem({
    device: "/tmp/btrfs.img",
    formatIfNeeded: true,
    mount: "/mnt/btrfs",
    uid: process.getuid?.(),
  });
}

export async function after() {
  await fs.unmount();
}
