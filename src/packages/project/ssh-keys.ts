import { project_id, compute_server_id } from "@cocalc/project/data";
import { sshServer } from "@cocalc/backend/data";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "path";
import { existsSync } from "node:fs";

const privateFile = join(process.env.HOME ?? "", ".ssh", "id_ed25519");
const publicFile = privateFile + ".pub";

export async function initSshKey() {
  if (!existsSync(privateFile)) {
    const seed = randomBytes(32);
    const { privateKey, publicKey } = ssh(
      seed,
      `project-${project_id}-${compute_server_id}`,
    );
    await mkdir(dirname(privateFile), { recursive: true, mode: 0o700 });
    await writeFile(privateFile, privateKey, { mode: 0o700 });
    await writeFile(publicFile, publicKey, { mode: 0o700 });
  }

  const hostConfig = `
# Added by CoCalc
Host file-server
  User project-${project_id}-${compute_server_id}
  HostName ${sshServer.host}
  Port ${sshServer.port}
  StrictHostKeyChecking no
`;
  const configPath = join(process.env.HOME ?? "", ".ssh", "config");
  let config;
  try {
    config = await readFile(configPath, "utf8");
  } catch {
    config = "";
  }
  if (!config.includes(hostConfig)) {
    await writeFile(configPath, hostConfig + "\n" + config);
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
