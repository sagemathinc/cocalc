import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "path";
import { existsSync } from "node:fs";
import { type SshServer } from "@cocalc/conat/project/runner/types";
import { SSH_IDENTITY_FILE } from "@cocalc/conat/project/runner/constants";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("backend:ssh-keys");

function files(home = process.env.HOME) {
  if (!home) {
    throw Error("home must be specified");
  }
  const privateFile = join(home, SSH_IDENTITY_FILE);
  const publicFile = privateFile + ".pub";
  return { privateFile, publicFile };
}

export async function initSshKeys({
  home = process.env.HOME,
  sshServers = [],
}: { home?: string; sshServers?: SshServer[] } = {}) {
  const { privateFile, publicFile } = files(home);
  if (!existsSync(privateFile)) {
    logger.debug(`creating ${privateFile}`);
    const seed = randomBytes(32);
    const { privateKey, publicKey } = ssh(seed, "root");
    await mkdir(dirname(privateFile), { recursive: true, mode: 0o700 });
    await writeFile(privateFile, privateKey, { mode: 0o600 });
    await writeFile(publicFile, publicKey, { mode: 0o600 });
  }

  for (const { name, host, port, user } of sshServers) {
    // We need "UpdateHostKeys no" because otherwise we see
    //    client_global_hostkeys_prove_confirm: server gave bad signature for RSA key 0: incorrect signature"
    // due to our sshpiperd proxy.
    const hostConfig = `
# Added by CoCalc
Host ${name}
  User ${user}
  HostName ${host}
  Port ${port}
  StrictHostKeyChecking no
  UpdateHostKeys no
  IdentityFile ~/${SSH_IDENTITY_FILE}
`;
    const configPath = join(home!, ".ssh", "config");
    let config;
    try {
      config = await readFile(configPath, "utf8");
    } catch {
      config = "";
    }
    if (!config.includes(hostConfig)) {
      // put at front since only the first with a given name is used by ssh
      logger.debug(`updating .ssh/config to include host ${name}`);
      await writeFile(configPath, hostConfig + "\n" + config, { mode: 0o600 });
    }
  }
}
export async function sshPublicKey(): Promise<string> {
  const { publicFile } = files();
  try {
    return await readFile(publicFile, "utf8");
  } catch {
    await initSshKeys();
    return await readFile(publicFile, "utf8");
  }
}
