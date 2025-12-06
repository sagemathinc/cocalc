import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { getHost, getLocalHostId, upsertHost } from "../sqlite/hosts";

export interface SshpiperdKey {
  publicKey: string;
  privateKey: string;
}

/**
 * Ensure there is a stable SSH keypair for sshpiperd on this project-host.
 * Stored in the local sqlite DB so restarts reuse the same key.
 */
export function ensureSshpiperdKey(host_id?: string): SshpiperdKey {
  const id = host_id ?? getLocalHostId();
  if (!id) {
    throw Error("host id unknown; cannot ensure sshpiperd key");
  }
  const existing = getHost(id);
  if (existing?.sshpiperd_public_key && existing?.sshpiperd_private_key) {
    return {
      publicKey: existing.sshpiperd_public_key,
      privateKey: existing.sshpiperd_private_key,
    };
  }

  const seed = randomBytes(32);
  const generated = ssh(seed, "project-host-sshpiperd");
  const key = {
    publicKey: generated.publicKey.trim(),
    privateKey: generated.privateKey,
  };

  upsertHost({
    host_id: id,
    sshpiperd_public_key: key.publicKey,
    sshpiperd_private_key: key.privateKey,
  });
  return key;
}
