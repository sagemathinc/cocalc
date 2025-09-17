import { project_id, compute_server_id } from "@cocalc/project/data";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "path";

const privateFile = join(process.env.HOME ?? "", ".ssh", "id_ed25519");
const publicFile = privateFile + ".pub";

export async function initSshKey() {
  const seed = randomBytes(32);
  const { privateKey, publicKey } = ssh(
    seed,
    `project-${project_id}-${compute_server_id}`,
  );
  await mkdir(dirname(privateFile), { recursive: true, mode: 0o700 });
  await writeFile(privateFile, privateKey, { mode: 0o700 });
  await writeFile(publicFile, publicKey, { mode: 0o700 });
  const [hostName, port = "2222"] = (
    process.env.COCALC_FILE_SERVER ?? ""
  ).split(":");
  await writeFile(
    join(process.env.HOME ?? "", ".ssh", "config"),
    `
Host sync
  User project-${project_id}-${compute_server_id}
  HostName ${hostName}
  Port ${port}
`,
    { mode: 0o700 },
  );
}
export async function sshPublicKey(): Promise<string> {
  try {
    return await readFile(publicFile, "utf8");
  } catch {
    await initSshKey();
    return await readFile(publicFile, "utf8");
  }
}
