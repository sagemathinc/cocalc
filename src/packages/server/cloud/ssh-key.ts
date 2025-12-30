import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import {
  getServerSettings,
  resetServerSettingsCache,
} from "@cocalc/database/settings/server-settings";

const logger = getLogger("server:cloud:ssh-key");
const pool = () => getPool();

export type ControlPlaneKeypair = {
  publicKey: string;
  privateKey: string;
};

let cachedKeypair: ControlPlaneKeypair | undefined;

async function execFileText(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = execFile(cmd, args, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr?.toString().trim() || err.message;
        return reject(new Error(detail));
      }
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
      });
    });
    child?.stdin?.end();
  });
}

async function derivePublicKeyFromPath(path: string): Promise<string> {
  const { stdout } = await execFileText("ssh-keygen", ["-y", "-f", path]);
  return stdout.trim();
}

async function derivePublicKeyFromString(
  privateKey: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cocalc-ssh-key-"));
  const keyPath = join(dir, "id_ed25519");
  try {
    await writeFile(keyPath, privateKey);
    await chmod(keyPath, 0o600);
    return await derivePublicKeyFromPath(keyPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function storePrivateKey(privateKey: string): Promise<void> {
  await pool().query(
    `
      INSERT INTO server_settings (name, value, readonly)
      VALUES ($1,$2,false)
      ON CONFLICT (name)
      DO UPDATE SET value=EXCLUDED.value, readonly=false
    `,
    ["control_plane_ssh_private_key", privateKey],
  );
  resetServerSettingsCache();
}

function generateKeypair(): ControlPlaneKeypair {
  const seed = randomBytes(32);
  const generated = ssh(seed, "cocalc-control-plane");
  return {
    publicKey: generated.publicKey.trim(),
    privateKey: generated.privateKey,
  };
}

export async function getControlPlaneSshKeypair(): Promise<ControlPlaneKeypair> {
  if (cachedKeypair) {
    return cachedKeypair;
  }

  const settings = await getServerSettings();
  const path = settings.control_plane_ssh_private_key_path?.trim();
  const stored = settings.control_plane_ssh_private_key?.trim();

  if (path) {
    const privateKey = await readFile(path, "utf8");
    const publicKey = await derivePublicKeyFromPath(path);
    cachedKeypair = { publicKey, privateKey };
    return cachedKeypair;
  }

  if (stored) {
    const publicKey = await derivePublicKeyFromString(stored);
    cachedKeypair = { publicKey, privateKey: stored };
    return cachedKeypair;
  }

  const client = await pool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      "control_plane_ssh_key",
    ]);
    resetServerSettingsCache();
    const locked = await getServerSettings();
    const lockedPath = locked.control_plane_ssh_private_key_path?.trim();
    const lockedStored = locked.control_plane_ssh_private_key?.trim();
    if (lockedPath) {
      const privateKey = await readFile(lockedPath, "utf8");
      const publicKey = await derivePublicKeyFromPath(lockedPath);
      cachedKeypair = { publicKey, privateKey };
      return cachedKeypair;
    }
    if (lockedStored) {
      const publicKey = await derivePublicKeyFromString(lockedStored);
      cachedKeypair = { publicKey, privateKey: lockedStored };
      return cachedKeypair;
    }

    const generated = generateKeypair();
    await storePrivateKey(generated.privateKey);
    cachedKeypair = generated;
    logger.info("generated control-plane SSH keypair");
    return cachedKeypair;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
      "control_plane_ssh_key",
    ]);
    client.release();
  }
}
