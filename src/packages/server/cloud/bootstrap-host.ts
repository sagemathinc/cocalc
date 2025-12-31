// Bootstrap remote project-host VMs over SSH: install deps, setup btrfs,
// transfer the SEA bundle, and register a systemd service to run the host.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import getPool from "@cocalc/database/pool";
import { buildHostSpec } from "./host-util";
import { normalizeProviderId } from "@cocalc/cloud";
import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import type { HostRuntime } from "@cocalc/cloud/types";
import { getControlPlaneSshKeypair } from "./ssh-key";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { enqueueCloudVmWork, logCloudVmEvent } from "./db";
import { argsJoin } from "@cocalc/util/args";
import getLogger from "@cocalc/backend/logger";
import { getServerProvider } from "./providers";

const logger = getLogger("server:cloud:bootstrap-host");

type HostBootstrapState = {
  status?: "running" | "done";
  started_at?: string;
  finished_at?: string;
};

type HostMetadata = {
  machine?: HostMachine;
  runtime?: HostRuntime;
  bootstrap?: HostBootstrapState;
  [key: string]: any;
};

type ProjectHostRow = {
  id: string;
  name?: string;
  region?: string;
  public_url?: string;
  internal_url?: string;
  ssh_server?: string;
  metadata?: HostMetadata;
};

async function updateHostRow(id: string, updates: Record<string, any>) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((key, idx) => `${key}=$${idx + 2}`);
  await getPool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1`,
    [id, ...keys.map((key) => updates[key])],
  );
}

async function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string } = {},
) {
  logger.debug(`${cmd} ${argsJoin(args)}`);
  return await new Promise<{
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const limit = 20000;
    child.stdout?.on("data", (d) => {
      if (stdoutChunks.join("").length < limit) {
        stdoutChunks.push(d.toString());
      }
    });
    child.stderr?.on("data", (d) => {
      if (stderrChunks.join("").length < limit) {
        stderrChunks.push(d.toString());
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      if (code === 0) return resolve({ stdout, stderr });
      const e = `${cmd} exited with code ${code}: ${stderr.trim() || stdout.trim()}`;
      logger.debug(e);
      reject(new Error(e));
    });
    if (opts.stdin) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }
  });
}

async function withTempSshKey<T>(
  fn: (opts: { keyPath: string; knownHosts: string }) => Promise<T>,
) {
  const { privateKey } = await getControlPlaneSshKeypair();
  if (!privateKey) {
    throw new Error("control plane ssh private key is not configured");
  }
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cocalc-control-ssh-"),
  );
  const keyPath = path.join(tempDir, "id_ed25519");
  const knownHosts = path.join(tempDir, "known_hosts");
  await fs.writeFile(keyPath, privateKey, { mode: 0o600 });
  await fs.writeFile(knownHosts, "", { mode: 0o600 });
  try {
    return await fn({ keyPath, knownHosts });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sshBaseArgs(opts: { keyPath: string; knownHosts: string }) {
  return [
    "-i",
    opts.keyPath,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${opts.knownHosts}`,
    "-o",
    "IdentitiesOnly=yes",
  ];
}

async function runSshScript(opts: {
  user: string;
  host: string;
  keyPath: string;
  knownHosts: string;
  script: string;
}) {
  const base = sshBaseArgs({
    keyPath: opts.keyPath,
    knownHosts: opts.knownHosts,
  });
  return await runCmd(
    "ssh",
    [...base, `${opts.user}@${opts.host}`, "bash", "-s"],
    {
      stdin: opts.script,
    },
  );
}

async function scpFile(opts: {
  user: string;
  host: string;
  keyPath: string;
  knownHosts: string;
  localPath: string;
  remotePath: string;
}) {
  const base = sshBaseArgs({
    keyPath: opts.keyPath,
    knownHosts: opts.knownHosts,
  });
  await runCmd("scp", [
    ...base,
    opts.localPath,
    `${opts.user}@${opts.host}:${opts.remotePath}`,
  ]);
}

export async function scheduleBootstrap(row: ProjectHostRow) {
  const runtime = row.metadata?.runtime;
  if (!runtime?.public_ip) return;
  const bootstrapStatus = row.metadata?.bootstrap?.status;
  if (bootstrapStatus === "done" || bootstrapStatus === "running") return;
  const providerId = normalizeProviderId(row.metadata?.machine?.cloud);
  await enqueueCloudVmWork({
    vm_id: row.id,
    action: "bootstrap",
    payload: { provider: providerId ?? row.metadata?.machine?.cloud },
  });
}

export async function handleBootstrap(row: ProjectHostRow) {
  logger.debug("handleBootstrap", { host_id: row.id });
  const runtime = row.metadata?.runtime;
  if (!runtime?.public_ip) {
    throw new Error("bootstrap requires public_ip");
  }
  const metadata = row.metadata ?? {};
  if (metadata.bootstrap?.status === "done") return;

  const { project_hosts_sea_path, project_hosts_sea_url } =
    await getServerSettings();
  const seaPath =
    project_hosts_sea_path || process.env.COCALC_PROJECT_HOST_SEA_PATH || "";
  const seaUrl =
    project_hosts_sea_url || process.env.COCALC_PROJECT_HOST_SEA_URL || "";
  if (!seaPath && !seaUrl) {
    throw new Error("project host SEA source is not configured");
  }

  const machine: HostMachine = metadata.machine ?? {};
  const sshUser = runtime.ssh_user ?? machine.metadata?.ssh_user ?? "ubuntu";
  const publicIp = runtime.public_ip;
  const masterAddress =
    process.env.MASTER_CONAT_SERVER ??
    process.env.COCALC_MASTER_CONAT_SERVER ??
    "";
  if (!masterAddress) {
    throw new Error("MASTER_CONAT_SERVER is not configured");
  }

  const spec = await buildHostSpec(row);
  const providerId = normalizeProviderId(machine.cloud);
  const storageMode = machine.storage_mode ?? machine.metadata?.storage_mode;
  const provider = providerId ? getServerProvider(providerId) : undefined;
  const dataDiskDevices =
    provider?.getBootstrapDataDiskDevices?.(spec, storageMode) ?? "";
  const imageSizeGb = Math.max(20, Number(spec.disk_gb ?? 100));
  const port = 9002;
  const sshPort = 2222;
  const publicUrl = row.public_url ?? `http://${publicIp}:${port}`;
  const internalUrl = row.internal_url ?? `http://${publicIp}:${port}`;
  const sshServer = row.ssh_server ?? `${publicIp}:${sshPort}`;
  const dataDir = "/var/lib/cocalc/project-host";
  const envFile = "/etc/cocalc/project-host.env";
  const seaRemote = "/opt/cocalc/project-host.tar.xz";

  const envLines = [
    `MASTER_CONAT_SERVER=${masterAddress}`,
    `PROJECT_HOST_ID=${row.id}`,
    `PROJECT_HOST_NAME=${row.name ?? row.id}`,
    `PROJECT_HOST_REGION=${row.region ?? ""}`,
    `PROJECT_HOST_PUBLIC_URL=${publicUrl}`,
    `PROJECT_HOST_INTERNAL_URL=${internalUrl}`,
    `PROJECT_HOST_SSH_SERVER=${sshServer}`,
    `PROJECT_RUNNER_NAME=0`,
    `COCALC_FILE_SERVER_MOUNTPOINT=/btrfs`,
    `DATA=${dataDir}`,
    `COCALC_DATA=${dataDir}`,
    `COCALC_LITE_SQLITE_FILENAME=${dataDir}/sqlite.db`,
    `HOST=0.0.0.0`,
    `PORT=${port}`,
    `DEBUG=cocalc:*`,
    `DEBUG_CONSOLE=no`,
    `DEBUG_FILE=${dataDir}/log`,
    `COCALC_SSH_SERVER=0.0.0.0:${sshPort}`,
  ];
  const envToken = "EOF_COCALC_ENV";
  const envBlock = `cat <<'${envToken}' | sudo tee ${envFile} >/dev/null\n${envLines.join(
    "\n",
  )}\n${envToken}\n`;

  const bootstrapScript = `
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y podman btrfs-progs uidmap slirp4netns fuse-overlayfs curl xz-utils
sudo sysctl -w kernel.unprivileged_userns_clone=1 || true
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${sshUser} || true
sudo mkdir -p /opt/cocalc /var/lib/cocalc /etc/cocalc
sudo chown -R ${sshUser}:${sshUser} /opt/cocalc /var/lib/cocalc
sudo mkdir -p /btrfs
DATA_DISK_DEV=""
if [ -n "${dataDiskDevices}" ]; then
  for dev in ${dataDiskDevices}; do
    if [ -b "$dev" ]; then
      DATA_DISK_DEV="$dev"
      break
    fi
  done
fi
if [ -n "$DATA_DISK_DEV" ]; then
  if ! sudo blkid "$DATA_DISK_DEV" | grep -q btrfs; then
    sudo mkfs.btrfs -f "$DATA_DISK_DEV"
  fi
  if ! mountpoint -q /btrfs; then
    sudo mount "$DATA_DISK_DEV" /btrfs
  fi
else
  sudo mkdir -p /var/lib/cocalc
  if [ ! -f /var/lib/cocalc/btrfs.img ]; then
    sudo truncate -s ${imageSizeGb}G /var/lib/cocalc/btrfs.img
    sudo mkfs.btrfs -f /var/lib/cocalc/btrfs.img
  fi
  if ! mountpoint -q /btrfs; then
    sudo mount -o loop /var/lib/cocalc/btrfs.img /btrfs
  fi
fi
sudo chown ${sshUser}:${sshUser} /btrfs || true
${envBlock}
sudo systemctl daemon-reload || true
`;

  const serviceUnit = `
[Unit]
Description=CoCalc Project Host
After=network-online.target

[Service]
Type=simple
User=${sshUser}
EnvironmentFile=${envFile}
WorkingDirectory=/opt/cocalc/project-host
ExecStart=/opt/cocalc/project-host/cocalc-project-host
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  const serviceToken = "EOF_COCALC_SERVICE";
  const installService = `
set -euo pipefail
sudo rm -rf /opt/cocalc/project-host
sudo mkdir -p /opt/cocalc/project-host
sudo tar -xJf ${seaRemote} -C /opt/cocalc/project-host
cd /opt/cocalc/project-host
dir=$(ls -1d cocalc-project-host-* | head -n1)
sudo ln -sfn "$dir" /opt/cocalc/project-host
cat <<'${serviceToken}' | sudo tee /etc/systemd/system/cocalc-project-host.service >/dev/null
${serviceUnit}
${serviceToken}
sudo systemctl daemon-reload
sudo systemctl enable --now cocalc-project-host
`;

  await updateHostRow(row.id, {
    metadata: {
      ...metadata,
      bootstrap: { status: "running", started_at: new Date().toISOString() },
    },
  });

  await withTempSshKey(async ({ keyPath, knownHosts }) => {
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: bootstrapScript,
    });
    if (seaPath) {
      await scpFile({
        user: sshUser,
        host: publicIp,
        keyPath,
        knownHosts,
        localPath: seaPath,
        remotePath: seaRemote,
      });
    } else {
      await runSshScript({
        user: sshUser,
        host: publicIp,
        keyPath,
        knownHosts,
        script: `set -euo pipefail\ncurl -L "${seaUrl}" -o ${seaRemote}\n`,
      });
    }
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: installService,
    });
  });

  await updateHostRow(row.id, {
    metadata: {
      ...metadata,
      bootstrap: { status: "done", finished_at: new Date().toISOString() },
    },
  });
  await logCloudVmEvent({
    vm_id: row.id,
    action: "bootstrap",
    status: "success",
    provider: providerId ?? machine.cloud,
    spec: machine,
    runtime,
  });
}
