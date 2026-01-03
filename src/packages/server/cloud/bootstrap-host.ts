// Bootstrap remote project-host VMs over SSH: install deps, setup btrfs,
// transfer the SEA bundle, and register a systemd service to run the host.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { URL } from "node:url";
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
import { conatPasswordPath } from "@cocalc/backend/data";
import {
  ensureCloudflareTunnelForHost,
  type CloudflareTunnel,
} from "./cloudflare-tunnel";

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
  cloudflare_tunnel?: CloudflareTunnel;
  [key: string]: any;
};

type ProjectHostRow = {
  id: string;
  name?: string;
  region?: string;
  public_url?: string;
  internal_url?: string;
  ssh_server?: string;
  status?: string;
  metadata?: HostMetadata;
};

async function updateHostRow(id: string, updates: Record<string, any>) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((key, idx) => `${key}=$${idx + 2}`);
  await getPool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
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
    "-o",
    "ConnectTimeout=15",
  ];
}

const BOOTSTRAP_SSH_WAIT_MS = 10 * 60 * 1000;
const BOOTSTRAP_SSH_RETRY_MS = 15 * 1000;

function shouldRetrySsh(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  const lowered = msg.toLowerCase();
  return (
    lowered.includes("exited with code 255") ||
    lowered.includes("connection timed out") ||
    lowered.includes("operation timed out") ||
    lowered.includes("no route to host") ||
    lowered.includes("connection refused") ||
    lowered.includes("connection closed") ||
    lowered.includes("could not resolve hostname")
  );
}

async function retrySsh<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + BOOTSTRAP_SSH_WAIT_MS;
  let attempt = 0;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetrySsh(err)) {
        throw err;
      }
      logger.info("bootstrap: ssh not ready, retrying", {
        label,
        attempt,
        err: String(err),
      });
      await new Promise((resolve) =>
        setTimeout(resolve, BOOTSTRAP_SSH_RETRY_MS),
      );
    }
  }
  throw new Error(
    `ssh not reachable after ${Math.round(BOOTSTRAP_SSH_WAIT_MS / 60000)} minutes: ${String(lastErr)}`,
  );
}

async function runSshScript(opts: {
  user: string;
  host: string;
  keyPath: string;
  knownHosts: string;
  script: string;
  scriptPath: string;
}) {
  const base = sshBaseArgs({
    keyPath: opts.keyPath,
    knownHosts: opts.knownHosts,
  });
  const logPath = opts.scriptPath.endsWith(".sh")
    ? `${opts.scriptPath.slice(0, -3)}.log`
    : `${opts.scriptPath}.log`;
  const token = `COCALC_BOOTSTRAP_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const scriptPath = opts.scriptPath.replace(/"/g, '\\"');
  const logPathEscaped = logPath.replace(/"/g, '\\"');
  const wrapper = `set -euo pipefail
script_path="${scriptPath}"
log_path="${logPathEscaped}"
script_dir=$(dirname "$script_path")
mkdir -p "$script_dir"
cat <<'${token}' > "$script_path"
${opts.script.trim()}
${token}
chmod +x "$script_path"
if [ "$log_path" = "$script_path" ]; then
  log_path="\${script_path}.log"
fi
bash "$script_path" 2>&1 | tee "$log_path"
`;
  return await retrySsh(`ssh ${opts.host}`, async () => {
    return await runCmd(
      "ssh",
      [...base, `${opts.user}@${opts.host}`, "bash", "-s"],
      {
        stdin: wrapper,
      },
    );
  });
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
  await retrySsh(`scp ${opts.host}`, async () => {
    await runCmd("scp", [
      ...base,
      opts.localPath,
      `${opts.user}@${opts.host}:${opts.remotePath}`,
    ]);
  });
}

export async function scheduleBootstrap(row: ProjectHostRow) {
  const { project_hosts_sea_path, project_hosts_sea_url } =
    await getServerSettings();
  const seaPath =
    project_hosts_sea_path || process.env.COCALC_PROJECT_HOST_SEA_PATH || "";
  const seaUrl =
    project_hosts_sea_url || process.env.COCALC_PROJECT_HOST_SEA_URL || "";
  const masterAddress =
    process.env.MASTER_CONAT_SERVER ??
    process.env.COCALC_MASTER_CONAT_SERVER ??
    "";
  if (!seaPath && !seaUrl) return;
  if (!masterAddress) return;
  if (
    row.status &&
    row.status !== "running" &&
    row.status !== "starting"
  )
    return;
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

  const tunnel = await ensureCloudflareTunnelForHost({
    host_id: row.id,
    existing: metadata.cloudflare_tunnel,
  });
  const tunnelEnabled = !!tunnel;

  const spec = await buildHostSpec(row);
  const providerId = normalizeProviderId(machine.cloud);
  const storageMode = machine.storage_mode ?? machine.metadata?.storage_mode;
  const provider = providerId ? getServerProvider(providerId) : undefined;
  const dataDiskDevices =
    provider?.getBootstrapDataDiskDevices?.(spec, storageMode) ?? "";
  const imageSizeGb = Math.max(20, Number(spec.disk_gb ?? 100));
  const port = tunnelEnabled ? 9002 : 443;
  const sshPort = 2222;
  const publicUrl = tunnel?.hostname
    ? `https://${tunnel.hostname}`
    : row.public_url
      ? row.public_url.replace(/^http:\/\//, "https://")
      : `https://${publicIp}`;
  const internalUrl = tunnel?.hostname
    ? `https://${tunnel.hostname}`
    : row.internal_url
      ? row.internal_url.replace(/^http:\/\//, "https://")
      : `https://${publicIp}`;
  const sshServer = row.ssh_server ?? `${publicIp}:${sshPort}`;
  const dataDir = "/btrfs/data";
  const envFile = "/etc/cocalc/project-host.env";
  const seaRemote = "/opt/cocalc/project-host.tar.xz";
  const dataDiskCandidates = dataDiskDevices || "none";
  let tlsHostname = publicIp;
  const tlsEnabled = !tunnelEnabled;
  try {
    tlsHostname = new URL(publicUrl).hostname || publicIp;
  } catch {
    tlsHostname = publicIp;
  }

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
    `COCALC_PROJECT_HOST_HTTPS=${tlsEnabled ? "1" : "0"}`,
    `HOST=0.0.0.0`,
    `PORT=${port}`,
    `DEBUG=cocalc:*`,
    `DEBUG_CONSOLE=yes`,
    `COCALC_SSH_SERVER=0.0.0.0:${sshPort}`,
  ];
  if (tlsEnabled) {
    envLines.push(`COCALC_PROJECT_HOST_HTTPS_HOSTNAME=${tlsHostname}`);
  }
  const envToken = "EOF_COCALC_ENV";
  const envBlock = `cat <<'${envToken}' | sudo tee ${envFile} >/dev/null\n${envLines.join(
    "\n",
  )}\n${envToken}\n`;

  let bootstrapScript = `
set -euo pipefail
echo "bootstrap: updating apt package lists"
sudo apt-get update -y
echo "bootstrap: installing base packages"
sudo apt-get install -y podman btrfs-progs uidmap slirp4netns fuse-overlayfs curl xz-utils rsync vim crun
echo "bootstrap: enabling unprivileged user namespaces"
sudo sysctl -w kernel.unprivileged_userns_clone=1 || true
echo "bootstrap: ensuring subuid/subgid ranges for ${sshUser}"
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${sshUser} || true
echo "bootstrap: preparing cocalc directories"
sudo mkdir -p /opt/cocalc /var/lib/cocalc /etc/cocalc
sudo chown -R ${sshUser}:${sshUser} /opt/cocalc /var/lib/cocalc
sudo mkdir -p /btrfs
echo "bootstrap: data disk candidates: ${dataDiskCandidates}"
DATA_DISK_DEV=""
if [ -n "${dataDiskDevices}" ]; then
  pick_data_disk() {
    for dev in ${dataDiskDevices}; do
      if [ -b "$dev" ]; then
        mountpoints="$(lsblk -nr -o MOUNTPOINT "$dev" 2>/dev/null | grep -v '^$' || true)"
        if [ -n "$mountpoints" ]; then
          if echo "$mountpoints" | grep -qx "/btrfs"; then
            echo "$dev"
            return 0
          fi
          echo "bootstrap: skipping $dev (mounted at $mountpoints)"
          continue
        fi
        echo "$dev"
        return 0
      fi
    done
    return 1
  }
  echo "bootstrap: waiting for data disk (up to 600s)"
  for attempt in $(seq 1 60); do
    DATA_DISK_DEV="$(pick_data_disk || true)"
    if [ -n "$DATA_DISK_DEV" ]; then
      break
    fi
    echo "bootstrap: data disk not ready (attempt $attempt/60)"
    sleep 10
  done
fi
if [ -n "$DATA_DISK_DEV" ]; then
  echo "bootstrap: using data disk $DATA_DISK_DEV"
  if ! sudo blkid "$DATA_DISK_DEV" | grep -q btrfs; then
    echo "bootstrap: formatting $DATA_DISK_DEV as btrfs"
    sudo mkfs.btrfs -f "$DATA_DISK_DEV"
  fi
  if ! mountpoint -q /btrfs; then
    echo "bootstrap: mounting $DATA_DISK_DEV at /btrfs"
    sudo mount "$DATA_DISK_DEV" /btrfs
  fi
else
  echo "bootstrap: no data disk found; using loopback image"
  sudo mkdir -p /var/lib/cocalc
  if [ ! -f /var/lib/cocalc/btrfs.img ]; then
    echo "bootstrap: creating /var/lib/cocalc/btrfs.img (${imageSizeGb}G)"
    sudo truncate -s ${imageSizeGb}G /var/lib/cocalc/btrfs.img
    echo "bootstrap: formatting /var/lib/cocalc/btrfs.img as btrfs"
    sudo mkfs.btrfs -f /var/lib/cocalc/btrfs.img
  fi
  if ! mountpoint -q /btrfs; then
    echo "bootstrap: mounting loopback btrfs image at /btrfs"
    sudo mount -o loop /var/lib/cocalc/btrfs.img /btrfs
  fi
fi
sudo chown ${sshUser}:${sshUser} /btrfs || true
echo "bootstrap: ensuring /btrfs/data subvolume"
if ! sudo btrfs subvolume show /btrfs/data >/dev/null 2>&1; then
  if ! sudo btrfs subvolume create /btrfs/data >/dev/null 2>&1; then
    echo "bootstrap: btrfs subvolume create failed; using directory"
    sudo mkdir -p /btrfs/data
  fi
fi
sudo mkdir -p /btrfs/data/secrets
sudo chown -R ${sshUser}:${sshUser} /btrfs/data || true
echo "bootstrap: writing project-host env to ${envFile}"
${envBlock}
sudo systemctl daemon-reload || true

echo 'sudo journalctl -u cocalc-project-host.service' > $HOME/bootstrap/logs
echo 'sudo systemctl \${1-status} cocalc-project-host' > $HOME/bootstrap/ctl
chmod +x $HOME/bootstrap/ctl $HOME/bootstrap/logs
`;
  let cloudflaredScript = "";
  let cloudflaredServiceUnit = "";
  if (tunnel && tunnelEnabled) {
    const useToken = Boolean(tunnel.token);
    if (!useToken) {
      logger.warn("cloudflare tunnel token missing; using credentials file", {
        host_id: row.id,
        tunnel_id: tunnel.id,
      });
    }
    const configToken = "EOF_CLOUDFLARE_CONFIG";
    const tokenEnvToken = "EOF_CLOUDFLARE_TOKEN";
    const credsToken = "EOF_CLOUDFLARE_CREDS";
    const creds = JSON.stringify({
      AccountTag: tunnel.account_id,
      TunnelID: tunnel.id,
      TunnelName: tunnel.name,
      TunnelSecret: tunnel.tunnel_secret,
    });
    cloudflaredScript = `
echo "bootstrap: installing cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi
sudo mkdir -p /etc/cloudflared
${useToken ? `cat <<'${tokenEnvToken}' | sudo tee /etc/cloudflared/token.env >/dev/null
CLOUDFLARED_TOKEN=${tunnel.token}
${tokenEnvToken}
sudo chmod 600 /etc/cloudflared/token.env
` : `cat <<'${credsToken}' | sudo tee /etc/cloudflared/${tunnel.id}.json >/dev/null
${creds}
${credsToken}
sudo chmod 600 /etc/cloudflared/${tunnel.id}.json
`}
cat <<'${configToken}' | sudo tee /etc/cloudflared/config.yml >/dev/null
${useToken ? "" : `tunnel: ${tunnel.id}
credentials-file: /etc/cloudflared/${tunnel.id}.json`}
ingress:
  - hostname: ${tunnel.hostname}
    service: http://localhost:${port}
  - service: http_status:404
${configToken}
`;
    cloudflaredServiceUnit = `
[Unit]
Description=Cloudflare Tunnel for CoCalc Project Host
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
${useToken ? "EnvironmentFile=/etc/cloudflared/token.env" : ""}
ExecStart=/usr/bin/cloudflared --config /etc/cloudflared/config.yml tunnel run${useToken ? " --token $CLOUDFLARED_TOKEN" : ""}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  }

  const serviceUnit = `
[Unit]
Description=CoCalc Project Host
After=network-online.target

[Service]
Type=simple
User=${sshUser}
${tlsEnabled ? "AmbientCapabilities=CAP_NET_BIND_SERVICE" : ""}
RuntimeDirectory=cocalc-project-host
RuntimeDirectoryMode=0700
Environment=XDG_RUNTIME_DIR=/run/cocalc-project-host
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
sudo tar -xJf ${seaRemote}  --strip-components=2 -C /opt/cocalc/project-host
cd /opt/cocalc/project-host
cat <<'${serviceToken}' | sudo tee /etc/systemd/system/cocalc-project-host.service >/dev/null
${serviceUnit}
${serviceToken}
${cloudflaredServiceUnit ? `cat <<'EOF_CLOUDFLARED_SERVICE' | sudo tee /etc/systemd/system/cocalc-cloudflared.service >/dev/null
${cloudflaredServiceUnit}
EOF_CLOUDFLARED_SERVICE
` : ""}
sudo systemctl daemon-reload
sudo systemctl enable --now cocalc-project-host
${cloudflaredServiceUnit ? "sudo systemctl enable --now cocalc-cloudflared" : ""}
`;

  if (cloudflaredScript) {
    bootstrapScript += cloudflaredScript;
  }

  await updateHostRow(row.id, {
    metadata: {
      ...metadata,
      ...(tunnel ? { cloudflare_tunnel: tunnel } : {}),
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
      scriptPath: "$HOME/bootstrap/install.sh",
    });
    // [ ] TODO: obviously we should generate distinct conat accounts
    //     for each project-host instead of reusing the master password!
    await scpFile({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      localPath: conatPasswordPath,
      remotePath: "/btrfs/data/secrets/conat-password",
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
        scriptPath: "$HOME/bootstrap/fetch-sea.sh",
      });
    }
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: installService,
      scriptPath: "$HOME/bootstrap/install-service.sh",
    });
  });

  await updateHostRow(row.id, {
    metadata: {
      ...metadata,
      ...(tunnel ? { cloudflare_tunnel: tunnel } : {}),
      bootstrap: { status: "done", finished_at: new Date().toISOString() },
    },
    status: row.status === "starting" ? "running" : row.status,
    public_url: publicUrl,
    internal_url: internalUrl,
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
