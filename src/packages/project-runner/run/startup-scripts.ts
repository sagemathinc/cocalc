import {
  PORTS,
  SSHD_CONFIG,
  START_PROJECT_SSH,
  START_PROJECT_FORWARDS,
} from "@cocalc/conat/project/runner/constants";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "path";

export async function writeStartupScripts(home: string) {
  const ssh = join(home, START_PROJECT_SSH);
  await mkdir(dirname(ssh), { recursive: true });
  await writeFile(ssh, START_PROJECT_SSH_SERVER_SH, {
    mode: 0o700,
  });
  const forward = join(home, START_PROJECT_FORWARDS);
  await mkdir(dirname(forward), { recursive: true });
  await writeFile(forward, START_PROJECT_FORWARDS_SH, {
    mode: 0o700,
  });
}

// These scripts are run every time a project starts,
// so do NOT make them slow!  The should take a few milliseconds.

const START_PROJECT_SSH_SERVER_SH = `#!/usr/bin/env bash
set -ev

mkdir -p /etc/dropbear

dropbear -p \${COCALC_SSHD_PORT:=22} -e -s -a -R -D /root/${SSHD_CONFIG}

ln -sf $(which sftp-server) /usr/libexec/sftp-server || true
`;

const START_PROJECT_FORWARDS_SH = `#!/usr/bin/env bash
set -ev

reflect-sync forward list sshd  2>/dev/null || reflect forward create --name=sshd  file-server:${PORTS.sshd}  localhost:\${COCALC_SSHD_PORT:=22}

reflect-sync forward list proxy 2>/dev/null || reflect forward create --name=proxy file-server:${PORTS.proxy} localhost:\${COCALC_SSHD_PORT:=80}

reflect-sync daemon start
`;
