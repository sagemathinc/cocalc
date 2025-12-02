import { SSHD_CONFIG, START_PROJECT_SSH } from "@cocalc/conat/project/runner/constants";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "path";

export async function writeStartupScripts(home: string) {
  const ssh = join(home, START_PROJECT_SSH);
  await mkdir(dirname(ssh), { recursive: true });
  await writeFile(ssh, START_PROJECT_SSH_SERVER_SH, {
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
