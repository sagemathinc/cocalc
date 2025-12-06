import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { getHost, getLocalHostId, upsertHost } from "../sqlite/hosts";

export interface BtrfsSshKey {
  publicKey: string;
  privateKey: string;
}

// Stable keypair for the host-level btrfs receive sshd.
export function ensureBtrfsSshKey(host_id?: string): BtrfsSshKey {
  const id = host_id ?? getLocalHostId();
  if (!id) {
    throw Error("host id unknown; cannot ensure btrfs ssh key");
  }
  const existing = getHost(id);
  if (existing?.btrfs_ssh_public_key && existing?.btrfs_ssh_private_key) {
    return {
      publicKey: existing.btrfs_ssh_public_key,
      privateKey: existing.btrfs_ssh_private_key,
    };
  }

  const seed = randomBytes(32);
  const generated = ssh(seed, "project-host-btrfs");
  const key = {
    publicKey: generated.publicKey.trim(),
    privateKey: generated.privateKey,
  };

  upsertHost({
    host_id: id,
    btrfs_ssh_public_key: key.publicKey,
    btrfs_ssh_private_key: key.privateKey,
  });
  return key;
}
