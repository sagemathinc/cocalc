import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { getHost, getLocalHostId, upsertHost } from "../sqlite/hosts";

export interface HostKey {
  publicKey: string;
  privateKey: string;
}

/**
 * Ensure there is a stable SSH keypair for host-to-host operations.
 * Stored in the local sqlite DB so restarts reuse the same key.
 */
export function ensureHostKey(host_id?: string): HostKey {
  const id = host_id ?? getLocalHostId();
  if (!id) {
    throw Error("host id unknown; cannot ensure host key");
  }
  const existing = getHost(id);
  if (existing?.host_to_host_public_key && existing?.host_to_host_private_key) {
    return {
      publicKey: existing.host_to_host_public_key,
      privateKey: existing.host_to_host_private_key,
    };
  }

  const seed = randomBytes(32);
  const generated = ssh(seed, "project-host");
  const key = {
    publicKey: generated.publicKey.trim(),
    privateKey: generated.privateKey,
  };

  upsertHost({
    host_id: id,
    host_to_host_public_key: key.publicKey,
    host_to_host_private_key: key.privateKey,
  });
  return key;
}
