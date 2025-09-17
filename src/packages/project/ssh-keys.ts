import { project_id, compute_server_id } from "@cocalc/project/data";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "path";
import { execFile } from "node:child_process";

const privateFile = join(process.env.HOME ?? "", ".ssh", "id_ed25519");
const publicFile = privateFile + ".pub";
const dropbearFile = join(process.env.HOME ?? "", ".ssh", "id_dropbear");

export async function initSshKey() {
  const pub = existsSync(publicFile);
  const priv = existsSync(privateFile);
  let drop = existsSync(dropbearFile);
  if (pub && priv && drop) {
    return;
  }
  if (!pub || !priv) {
    const seed = randomBytes(32);
    const { privateKey, publicKey } = ssh(
      seed,
      `project-${project_id}-${compute_server_id}`,
    );
    await mkdir(dirname(privateFile), { recursive: true, mode: 0o700 });
    await writeFile(privateFile, privateKey, { mode: 0o700 });
    await writeFile(publicFile, publicKey, { mode: 0o700 });
    drop = false;
  }
  if (!drop) {
    await execFile(
      "dropbearconvert",
      ["openssh", "dropbear", "id_ed25519", "id_dropbear"],
      { cwd: join(process.env.HOME ?? "", ".ssh") },
    );
  }
}
export async function sshPublicKey(): Promise<string> {
  try {
    return await readFile(publicFile, "utf8");
  } catch {
    await initSshKey();
    return await readFile(publicFile, "utf8");
  }
}
