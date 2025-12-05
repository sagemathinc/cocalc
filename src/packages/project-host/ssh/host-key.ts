import { getRow, upsertRow } from "@cocalc/lite/hub/sqlite/database";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";

const TABLE = "project-host";
const PK = "host-ssh-key";

export interface HostKey {
  publicKey: string;
  privateKey: string;
}

/**
 * Ensure there is a stable SSH keypair for this project-host.
 * Stored in the local sqlite DB so restarts reuse the same key.
 */
export function ensureHostKey(): HostKey {
  const existing = getRow(TABLE, PK) as HostKey | undefined;
  if (existing?.publicKey && existing?.privateKey) {
    return existing;
  }

  const seed = randomBytes(32);
  const generated = ssh(seed, "project-host");
  const key = {
    publicKey: generated.publicKey.trim(),
    privateKey: generated.privateKey,
  };

  upsertRow(TABLE, PK, key);
  return key;
}
