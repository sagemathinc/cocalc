/*
 * Project-host bootstrap lifecycle
 * - Cloud-init runs once on first boot using a short-lived token to fetch
 *   the bootstrap scripts + conat password from the hub.
 * - Bootstrap installs deps, prepares /btrfs, downloads the SEA, and starts
 *   the project-host daemon. It also installs a cron @reboot hook so the
 *   daemon restarts on every VM reboot without re-running bootstrap.
 * - SSH bootstrap is disabled; cloud-init is the sole bootstrap path.
 * - cloudflared (if enabled) is managed by systemd and restarts on reboot.
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { buildHostSpec } from "./host-util";
import { normalizeProviderId } from "@cocalc/cloud";
import type { HostMachine } from "@cocalc/conat/hub/api/hosts";
import type { HostRuntime } from "@cocalc/cloud/types";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getServerProvider } from "./providers";
import {
  ensureCloudflareTunnelForHost,
  type CloudflareTunnel,
} from "./cloudflare-tunnel";

const logger = getLogger("server:cloud:bootstrap-host");
const pool = () => getPool("medium");

type HostBootstrapState = {
  status?: "pending" | "running" | "done";
  started_at?: string;
  finished_at?: string;
  pending_at?: string;
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

const DEFAULT_SOFTWARE_BASE_URL = "https://software.cocalc.ai/software";

function normalizeSoftwareBaseUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  const base = trimmed || DEFAULT_SOFTWARE_BASE_URL;
  return base.replace(/\/+$/, "");
}

type SoftwareArch = "amd64" | "arm64";
type SoftwareOs = "linux" | "darwin";

function normalizeArch(raw?: string): SoftwareArch | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (value === "amd64" || value === "x86_64" || value === "x64")
    return "amd64";
  if (value === "arm64" || value === "aarch64") return "arm64";
  return undefined;
}

function normalizeOs(raw?: string): SoftwareOs | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (value === "linux") return "linux";
  if (value === "darwin" || value === "macos" || value === "osx")
    return "darwin";
  return undefined;
}

async function resolveSelfHostArch(connectorId: string): Promise<{
  arch?: SoftwareArch;
  os?: SoftwareOs;
}> {
  const { rows } = await pool().query<{
    metadata: Record<string, any>;
  }>(
    `SELECT metadata
       FROM self_host_connectors
      WHERE connector_id=$1 AND revoked IS NOT TRUE`,
    [connectorId],
  );
  const metadata = rows[0]?.metadata ?? {};
  return {
    arch: normalizeArch(metadata.arch),
    os: normalizeOs(metadata.os),
  };
}

async function resolveTargetPlatform({
  providerId,
  row,
  runtime,
  machine,
}: {
  providerId?: string;
  row: ProjectHostRow;
  runtime?: HostRuntime;
  machine: HostMachine;
}): Promise<{ os: SoftwareOs; arch: SoftwareArch; source: string }> {
  const fromMetadata = normalizeArch(
    runtime?.metadata?.arch ??
      runtime?.metadata?.architecture ??
      machine.metadata?.arch ??
      machine.metadata?.architecture,
  );
  if (fromMetadata) {
    return { os: "linux", arch: fromMetadata, source: "metadata" };
  }
  if (providerId === "self-host" && row.region) {
    const connectorInfo = await resolveSelfHostArch(row.region);
    if (connectorInfo.arch) {
      return {
        os: "linux",
        arch: connectorInfo.arch,
        source: "self-host-connector",
      };
    }
  }
  return { os: "linux", arch: "amd64", source: "default" };
}

function extractArtifactVersion(
  url: string,
  artifact: "project-host" | "project" | "tools",
): string | undefined {
  if (!url) return undefined;
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(new RegExp(`/${artifact}/([^/]+)/`));
    return match?.[1];
  } catch {
    return undefined;
  }
}

export type BootstrapScripts = {
  bootstrapScript: string;
  fetchSeaScript: string;
  fetchProjectBundleScript: string;
  fetchToolsScript: string;
  installServiceScript: string;
  publicUrl: string;
  internalUrl: string;
  sshServer: string;
  sshUser: string;
  seaRemote: string;
  resolvedSeaUrl: string;
  seaSha256: string;
  projectBundleUrl: string;
  projectBundleSha256: string;
  projectBundlesRoot: string;
  projectBundleDir: string;
  projectBundleRemote: string;
  toolsUrl: string;
  toolsSha256: string;
  toolsRoot: string;
  toolsDir: string;
  toolsRemote: string;
  tunnel?: CloudflareTunnel;
};

export async function buildBootstrapScripts(
  row: ProjectHostRow,
  opts: {
    tunnel?: CloudflareTunnel;
    conatPasswordCommand?: string;
    publicIpOverride?: string;
    allowEnvVarExpansion?: boolean;
  } = {},
): Promise<BootstrapScripts> {
  const runtime = row.metadata?.runtime;
  const metadata = row.metadata ?? {};
  const machine: HostMachine = metadata.machine ?? {};
  const hasGpu =
    !!metadata.gpu ||
    (machine.gpu_type != null && machine.gpu_type !== "none") ||
    (machine.gpu_count ?? 0) > 0;
  const sshUser = runtime?.ssh_user ?? machine.metadata?.ssh_user ?? "ubuntu";
  const publicIp = opts.publicIpOverride ?? runtime?.public_ip ?? "";
  if (!publicIp) {
    throw new Error("bootstrap requires public_ip");
  }

  const { project_hosts_software_base_url } = await getServerSettings();
  const softwareBaseUrl = normalizeSoftwareBaseUrl(
    project_hosts_software_base_url ||
      process.env.COCALC_PROJECT_HOST_SOFTWARE_BASE_URL ||
      "",
  );
  if (!softwareBaseUrl) {
    throw new Error("project host software base URL is not configured");
  }
  const providerId = normalizeProviderId(machine.cloud);
  const targetPlatform = await resolveTargetPlatform({
    providerId,
    row,
    runtime,
    machine,
  });
  const projectHostManifestUrl = `${softwareBaseUrl}/project-host/latest-${targetPlatform.os}-${targetPlatform.arch}.json`;
  const projectManifestUrl = `${softwareBaseUrl}/project/latest-${targetPlatform.os}-${targetPlatform.arch}.json`;
  const toolsManifestUrl = `${softwareBaseUrl}/tools/latest-${targetPlatform.os}-${targetPlatform.arch}.json`;
  const resolvedHostSea = await resolveSoftwareArtifact(
    projectHostManifestUrl,
    targetPlatform,
  );
  const resolvedSeaUrl = resolvedHostSea.url;
  const seaSha256 = (resolvedHostSea.sha256 ?? "").replace(/[^a-f0-9]/gi, "");
  const resolvedProjectBundle = await resolveSoftwareArtifact(
    projectManifestUrl,
    targetPlatform,
  );
  const projectBundleUrl = resolvedProjectBundle.url;
  const projectBundleSha256 = (resolvedProjectBundle.sha256 ?? "").replace(
    /[^a-f0-9]/gi,
    "",
  );
  const resolvedTools = await resolveSoftwareArtifact(
    toolsManifestUrl,
    targetPlatform,
  );
  const toolsUrl = resolvedTools.url;
  const toolsSha256 = (resolvedTools.sha256 ?? "").replace(/[^a-f0-9]/gi, "");
  const projectBundleVersion =
    extractArtifactVersion(projectBundleUrl, "project") || "latest";
  const projectBundlesRoot = "/opt/cocalc/project-bundles";
  const projectBundleDir = `${projectBundlesRoot}/${projectBundleVersion}`;
  const projectBundleRemote = "/opt/cocalc/project-bundle.tar.xz";
  const projectHostVersion =
    extractArtifactVersion(resolvedSeaUrl, "project-host") || "latest";
  const projectHostRoot = "/opt/cocalc/project-host";
  const projectHostDir = `${projectHostRoot}/versions/${projectHostVersion}`;
  const projectHostCurrent = `${projectHostRoot}/current`;
  const projectHostBin = `${projectHostCurrent}/cocalc-project-host`;
  const toolsVersion = extractArtifactVersion(toolsUrl, "tools") || "latest";
  const toolsRoot = "/opt/cocalc/tools";
  const toolsDir = `${toolsRoot}/${toolsVersion}`;
  const toolsRemote = "/opt/cocalc/tools.tar.xz";
  if (!resolvedSeaUrl) {
    throw new Error("project host SEA URL could not be resolved");
  }
  if (!projectBundleUrl) {
    throw new Error("project bundle URL could not be resolved");
  }
  if (!toolsUrl) {
    throw new Error("project tools URL could not be resolved");
  }

  const masterAddress =
    process.env.MASTER_CONAT_SERVER ??
    process.env.COCALC_MASTER_CONAT_SERVER ??
    "";
  if (!masterAddress) {
    throw new Error("MASTER_CONAT_SERVER is not configured");
  }

  const tunnel =
    opts.tunnel ??
    (await ensureCloudflareTunnelForHost({
      host_id: row.id,
      existing: metadata.cloudflare_tunnel,
    }));
  const tunnelEnabled = !!tunnel;

  const spec = await buildHostSpec(row);
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
  if (!publicUrl.includes("$")) {
    try {
      tlsHostname = new URL(publicUrl).hostname || publicIp;
    } catch {
      tlsHostname = publicIp;
    }
  }

  const allowEnvVarExpansion =
    opts.allowEnvVarExpansion ?? publicIp.includes("$");
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
    `COCALC_PROJECT_BUNDLES=${projectBundlesRoot}`,
    `COCALC_PROJECT_TOOLS=${toolsRoot}/current`,
    `COCALC_BIN_PATH=${toolsRoot}/current`,
    `COCALC_BTRFS_IMAGE_GB=${imageSizeGb}`,
    `COCALC_PROJECT_HOST_SOFTWARE_BASE_URL=${softwareBaseUrl}`,
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
  const envQuote = allowEnvVarExpansion ? "" : "'";
  const envBlock = `cat <<${envQuote}${envToken}${envQuote} | sudo tee ${envFile} >/dev/null\n${envLines.join(
    "\n",
  )}\n${envToken}\n`;
  const publicIpLookup = publicIp.includes("$")
    ? `
echo "bootstrap: detecting public IP"
PUBLIC_IP="$(curl -fsSL https://api.ipify.org || true)"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -fsSL https://ifconfig.me || true)"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "bootstrap: could not determine public IP"
fi
`
    : "";
  const bootstrapDir =
    sshUser === "root" ? "/root/bootstrap" : `/home/${sshUser}/bootstrap`;

  let bootstrapScript = `
set -euo pipefail
EXPECTED_OS="${targetPlatform.os}"
EXPECTED_ARCH="${targetPlatform.arch}"
BOOTSTRAP_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$BOOTSTRAP_OS" in
  linux) ;;
  *)
    echo "bootstrap: unsupported OS $BOOTSTRAP_OS (expected $EXPECTED_OS)" >&2
    exit 1
    ;;
esac
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) BOOTSTRAP_ARCH="amd64" ;;
  aarch64|arm64) BOOTSTRAP_ARCH="arm64" ;;
  *)
    echo "bootstrap: unsupported architecture $ARCH_RAW" >&2
    exit 1
    ;;
esac
if [ "$BOOTSTRAP_ARCH" != "$EXPECTED_ARCH" ]; then
  echo "bootstrap: unsupported architecture $BOOTSTRAP_ARCH (expected $EXPECTED_ARCH)" >&2
  exit 1
fi
ARCH="$BOOTSTRAP_ARCH"
echo "bootstrap: disabling unattended upgrades"
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl stop apt-daily.service apt-daily-upgrade.service unattended-upgrades.service || true
  sudo systemctl stop apt-daily.timer apt-daily-upgrade.timer || true
fi
sudo pkill -9 apt-get || true
sudo pkill -f -9 unattended-upgrade || true
sudo apt-get remove -y unattended-upgrades || true
echo "bootstrap: updating apt package lists"
sudo apt-get update -y
echo "bootstrap: installing base packages"
sudo apt-get install -y podman btrfs-progs uidmap slirp4netns fuse-overlayfs curl xz-utils rsync vim crun cron chrony
${
  hasGpu
    ? `
echo "bootstrap: installing nvidia container toolkit"
sudo apt-get install -y ca-certificates gnupg
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update -y
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
sudo usermod -aG video,render ${sshUser} || true
`
    : ""
}
echo "bootstrap: configuring time sync"
sudo systemctl disable --now systemd-timesyncd || true
sudo systemctl enable --now chrony || true
sudo tee /etc/chrony/chrony.conf >/dev/null <<'EOF_COCALC_CHRONY'
pool pool.ntp.org iburst maxsources 4
makestep 1.0 -1
rtcsync
EOF_COCALC_CHRONY
sudo systemctl restart chrony || true
${publicIpLookup}
echo "bootstrap: enabling unprivileged user namespaces"
sudo sysctl -w kernel.unprivileged_userns_clone=1 || true
echo "bootstrap: ensuring subuid/subgid ranges for ${sshUser}"
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${sshUser} || true
echo "bootstrap: preparing cocalc directories"
sudo mkdir -p /opt/cocalc /var/lib/cocalc /etc/cocalc
sudo chown -R ${sshUser}:${sshUser} /opt/cocalc /var/lib/cocalc
sudo mkdir -p /btrfs
echo "bootstrap: preparing bootstrap scripts"
BOOTSTRAP_DIR="${bootstrapDir}"
sudo mkdir -p "$BOOTSTRAP_DIR"
sudo chown -R ${sshUser}:${sshUser} "$BOOTSTRAP_DIR" || true
echo "bootstrap: data disk candidates: ${dataDiskCandidates}"
DATA_DISK_DEV=""
if [ -n "${dataDiskDevices}" ]; then
  pick_data_disk() {
    for dev in ${dataDiskDevices}; do
      if [ -b "$dev" ]; then
        mountpoints="$(lsblk -nr -o MOUNTPOINT "$dev" 2>/dev/null | grep -v '^$' || true)"
        if [ -n "$mountpoints" ]; then
          if echo "$mountpoints" | grep -qx "/btrfs"; then
            printf '%s\n' "$dev"
            return 0
          fi
          echo "bootstrap: skipping $dev (mounted at $mountpoints)" >&2
          continue
        fi
        printf '%s\n' "$dev"
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
  echo "bootstrap: ensuring /btrfs is mounted on reboot"
  FSTAB_LINE=""
  DATA_UUID="$(sudo blkid -s UUID -o value "$DATA_DISK_DEV" 2>/dev/null || true)"
  if [ -n "$DATA_UUID" ]; then
    FSTAB_LINE="UUID=$DATA_UUID /btrfs btrfs defaults,nofail 0 0"
  else
    FSTAB_LINE="$DATA_DISK_DEV /btrfs btrfs defaults,nofail 0 0"
  fi
  sudo sed -i.bak '/cocalc-btrfs/d' /etc/fstab
  echo "$FSTAB_LINE # cocalc-btrfs" | sudo tee -a /etc/fstab >/dev/null
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
  echo "bootstrap: ensuring /btrfs is mounted on reboot"
  sudo sed -i.bak '/cocalc-btrfs/d' /etc/fstab
  echo "/var/lib/cocalc/btrfs.img /btrfs btrfs loop,defaults,nofail 0 0 # cocalc-btrfs" | sudo tee -a /etc/fstab >/dev/null
fi
echo "bootstrap: installing btrfs resize helper"
sudo tee /usr/local/sbin/cocalc-grow-btrfs >/dev/null <<'EOF_COCALC_GROW'
#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "cocalc-grow-btrfs must run as root" >&2
  exit 1
fi
TARGET_GB="\${1:-}"
IMAGE="/var/lib/cocalc/btrfs.img"
MOUNTPOINT="/btrfs"
ENV_FILE="/etc/cocalc/project-host.env"
if [ -n "$TARGET_GB" ]; then
  TARGET_GB="\${TARGET_GB%%[!0-9]*}"
fi
if [ -n "$TARGET_GB" ] && [ -f "$ENV_FILE" ]; then
  if grep -q '^COCALC_BTRFS_IMAGE_GB=' "$ENV_FILE"; then
    sed -i.bak "s/^COCALC_BTRFS_IMAGE_GB=.*/COCALC_BTRFS_IMAGE_GB=\${TARGET_GB}/" "$ENV_FILE"
  else
    echo "COCALC_BTRFS_IMAGE_GB=\${TARGET_GB}" >> "$ENV_FILE"
  fi
fi
if ! mountpoint -q "$MOUNTPOINT"; then
  exit 0
fi
MOUNT_SOURCE="$(findmnt -n -o SOURCE "$MOUNTPOINT" 2>/dev/null || true)"
if [ "$MOUNT_SOURCE" = "$IMAGE" ] || [ "\${MOUNT_SOURCE#/dev/loop}" != "$MOUNT_SOURCE" ]; then
  if [ ! -f "$IMAGE" ]; then
    exit 0
  fi
  if [ -z "$TARGET_GB" ] && [ -f "$ENV_FILE" ]; then
    TARGET_GB="\$(grep -E '^COCALC_BTRFS_IMAGE_GB=' "$ENV_FILE" | tail -n1 | cut -d= -f2 || true)"
  fi
  if [ -z "$TARGET_GB" ] || ! echo "$TARGET_GB" | grep -Eq '^[0-9]+$'; then
    exit 0
  fi
  CURRENT_BYTES="\$(stat -c %s "$IMAGE" 2>/dev/null || echo 0)"
  TARGET_BYTES="\$((TARGET_GB * 1024 * 1024 * 1024))"
  if [ "$CURRENT_BYTES" -lt "$TARGET_BYTES" ]; then
    echo "bootstrap: growing btrfs image to \${TARGET_GB}G"
    truncate -s "\${TARGET_GB}G" "$IMAGE"
    LOOP_DEV="\$(losetup -j "$IMAGE" | head -n1 | cut -d: -f1 || true)"
    if [ -n "$LOOP_DEV" ]; then
      losetup -c "$LOOP_DEV" || true
    fi
  fi
  btrfs filesystem resize max "$MOUNTPOINT" >/dev/null 2>&1 || true
  exit 0
fi
# Block device (non-loop): just expand to max.
btrfs filesystem resize max "$MOUNTPOINT" >/dev/null 2>&1 || true
EOF_COCALC_GROW
sudo chmod +x /usr/local/sbin/cocalc-grow-btrfs
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
`;

  if (opts.conatPasswordCommand) {
    bootstrapScript += `\n${opts.conatPasswordCommand}\n`;
  }

  bootstrapScript += `
cat <<'EOF_COCALC_CTL' > "$BOOTSTRAP_DIR/ctl"
#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-status}"
bin="${projectHostBin}"
pid_file="/btrfs/data/daemon.pid"
case "\${cmd}" in
  start|stop)
    "\${bin}" daemon "\${cmd}"
    ;;
  restart)
    "\${bin}" daemon stop || true
    "\${bin}" daemon start
    ;;
  status)
    if [ -f "\${pid_file}" ] && kill -0 "\$(cat "\${pid_file}")" 2>/dev/null; then
      echo "project-host running (pid \$(cat "\${pid_file}"))"
    else
      echo "project-host not running"
      exit 1
    fi
    ;;
  *)
    echo "usage: \${0} {start|stop|restart|status}" >&2
    exit 2
    ;;
esac
EOF_COCALC_CTL
chmod +x "$BOOTSTRAP_DIR/ctl"
cat <<'EOF_COCALC_START' > "$BOOTSTRAP_DIR/start-project-host"
#!/usr/bin/env bash
set -euo pipefail
BOOTSTRAP_DIR="${bootstrapDir}"
CTL="$BOOTSTRAP_DIR/ctl"
for attempt in $(seq 1 60); do
  if mountpoint -q /btrfs; then
    if [ -x /usr/local/sbin/cocalc-grow-btrfs ]; then
      sudo /usr/local/sbin/cocalc-grow-btrfs || true
    fi
    exec "$CTL" start
  fi
  echo "waiting for /btrfs mount (attempt $attempt/60)"
  sudo mount /btrfs || true
  sleep 5
done
echo "timeout waiting for /btrfs mount"
exit 1
EOF_COCALC_START
chmod +x "$BOOTSTRAP_DIR/start-project-host"
echo 'tail -n 200 /btrfs/data/log -f' > "$BOOTSTRAP_DIR/logs"
chmod +x "$BOOTSTRAP_DIR/logs"

echo 'sudo journalctl -u cocalc-cloudflared.service -o cat -f -n 200' > "$BOOTSTRAP_DIR/logs-cf"
echo 'sudo systemctl \${1-status} cocalc-cloudflared' > "$BOOTSTRAP_DIR/ctl-cf"
chmod +x "$BOOTSTRAP_DIR/ctl-cf" "$BOOTSTRAP_DIR/logs-cf"

echo "bootstrap: configuring project-host autostart"
sudo tee /etc/cron.d/cocalc-project-host >/dev/null <<'EOF_COCALC_CRON'
@reboot ${sshUser} ${bootstrapDir}/start-project-host
EOF_COCALC_CRON
sudo chmod 644 /etc/cron.d/cocalc-project-host
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now cron || true
fi
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
  CLOUDFLARED_DEB="cloudflared-linux-\${ARCH}.deb"
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/\${CLOUDFLARED_DEB}
  sudo dpkg -i /tmp/cloudflared.deb
fi
sudo mkdir -p /etc/cloudflared
${
  useToken
    ? `cat <<'${tokenEnvToken}' | sudo tee /etc/cloudflared/token.env >/dev/null
CLOUDFLARED_TOKEN=${tunnel.token}
${tokenEnvToken}
sudo chmod 600 /etc/cloudflared/token.env
`
    : `cat <<'${credsToken}' | sudo tee /etc/cloudflared/${tunnel.id}.json >/dev/null
${creds}
${credsToken}
sudo chmod 600 /etc/cloudflared/${tunnel.id}.json
`
}
cat <<'${configToken}' | sudo tee /etc/cloudflared/config.yml >/dev/null
${
  useToken
    ? ""
    : `tunnel: ${tunnel.id}
credentials-file: /etc/cloudflared/${tunnel.id}.json`
}
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

  if (cloudflaredScript) {
    bootstrapScript += cloudflaredScript;
  }

  bootstrapScript += `
echo "bootstrap: re-enabling unattended upgrades"
sudo apt-get install -y unattended-upgrades || true
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now apt-daily.timer apt-daily-upgrade.timer unattended-upgrades.service || true
fi
`;

  const fetchSeaScript = `#!/usr/bin/env bash
set -euo pipefail
  SEA_URL="${resolvedSeaUrl.replace(/"/g, '\\"')}"
  SEA_SHA256="${seaSha256}"
  echo "bootstrap: downloading SEA from ${resolvedSeaUrl.replace(/"/g, '\\"')}"
  curl -fL "$SEA_URL" -o ${seaRemote}
  if [ -n "$SEA_SHA256" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      echo "$SEA_SHA256  ${seaRemote}" | sha256sum -c -
    else
      echo "bootstrap: sha256sum not available; skipping checksum"
    fi
  else
    if command -v sha256sum >/dev/null 2>&1; then
      if curl -fsSL "$SEA_URL.sha256" -o ${seaRemote}.sha256; then
        sha256sum -c ${seaRemote}.sha256 || true
      fi
    fi
  fi
`;

  const fetchProjectBundleScript = `#!/usr/bin/env bash
set -euo pipefail
  BUNDLE_URL="${projectBundleUrl.replace(/"/g, '\\"')}"
  BUNDLE_SHA256="${projectBundleSha256}"
  BUNDLE_REMOTE="${projectBundleRemote}"
  BUNDLE_DIR="${projectBundleDir}"
  BUNDLE_ROOT="${projectBundlesRoot}"
  BUNDLE_CURRENT="${projectBundlesRoot}/current"
  echo "bootstrap: downloading project bundle from ${projectBundleUrl.replace(/"/g, '\\"')}"
  curl -fL "$BUNDLE_URL" -o "$BUNDLE_REMOTE"
  if [ -n "$BUNDLE_SHA256" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      echo "$BUNDLE_SHA256  $BUNDLE_REMOTE" | sha256sum -c -
    else
      echo "bootstrap: sha256sum not available; skipping bundle checksum"
    fi
  else
    if command -v sha256sum >/dev/null 2>&1; then
      if curl -fsSL "$BUNDLE_URL.sha256" -o "$BUNDLE_REMOTE.sha256"; then
        sha256sum -c "$BUNDLE_REMOTE.sha256" || true
      fi
    fi
  fi
  mkdir -p "$BUNDLE_ROOT"
  rm -rf "$BUNDLE_DIR"
  mkdir -p "$BUNDLE_DIR"
  tar -xJf "$BUNDLE_REMOTE" --strip-components=1 -C "$BUNDLE_DIR"
  ln -sfn "$BUNDLE_DIR" "$BUNDLE_CURRENT"
`;
  const fetchToolsScript = `#!/usr/bin/env bash
set -euo pipefail
  TOOLS_URL="${toolsUrl.replace(/"/g, '\\"')}"
  TOOLS_SHA256="${toolsSha256}"
  TOOLS_REMOTE="${toolsRemote}"
  TOOLS_DIR="${toolsDir}"
  TOOLS_ROOT="${toolsRoot}"
  TOOLS_CURRENT="${toolsRoot}/current"
  echo "bootstrap: downloading tools bundle from ${toolsUrl.replace(/"/g, '\\"')}"
  curl -fL "$TOOLS_URL" -o "$TOOLS_REMOTE"
  if [ -n "$TOOLS_SHA256" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      echo "$TOOLS_SHA256  $TOOLS_REMOTE" | sha256sum -c -
    else
      echo "bootstrap: sha256sum not available; skipping tools checksum"
    fi
  else
    if command -v sha256sum >/dev/null 2>&1; then
      if curl -fsSL "$TOOLS_URL.sha256" -o "$TOOLS_REMOTE.sha256"; then
        sha256sum -c "$TOOLS_REMOTE.sha256" || true
      fi
    fi
  fi
  mkdir -p "$TOOLS_ROOT"
  rm -rf "$TOOLS_DIR"
  mkdir -p "$TOOLS_DIR"
  tar -xJf "$TOOLS_REMOTE" --strip-components=1 -C "$TOOLS_DIR"
  ln -sfn "$TOOLS_DIR" "$TOOLS_CURRENT"
`;

  bootstrapScript += `
echo "bootstrap: writing fetch scripts"
cat <<'EOF_COCALC_FETCH_SEA' > "$BOOTSTRAP_DIR/fetch-sea.sh"
${fetchSeaScript.trim()}
EOF_COCALC_FETCH_SEA
cat <<'EOF_COCALC_FETCH_BUNDLE' > "$BOOTSTRAP_DIR/fetch-project-bundle.sh"
${fetchProjectBundleScript.trim()}
EOF_COCALC_FETCH_BUNDLE
cat <<'EOF_COCALC_FETCH_TOOLS' > "$BOOTSTRAP_DIR/fetch-tools.sh"
${fetchToolsScript.trim()}
EOF_COCALC_FETCH_TOOLS
chmod +x "$BOOTSTRAP_DIR"/fetch-sea.sh "$BOOTSTRAP_DIR"/fetch-project-bundle.sh "$BOOTSTRAP_DIR"/fetch-tools.sh
sudo chown ${sshUser}:${sshUser} "$BOOTSTRAP_DIR"/fetch-sea.sh "$BOOTSTRAP_DIR"/fetch-project-bundle.sh "$BOOTSTRAP_DIR"/fetch-tools.sh || true
`;

  const installServiceScript = `
set -euo pipefail
if [ -x ${projectHostBin} ]; then
  ${projectHostBin} daemon stop || true
fi
sudo systemctl disable --now cocalc-project-host >/dev/null 2>&1 || true
sudo rm -f /etc/systemd/system/cocalc-project-host.service || true
sudo mkdir -p ${projectHostRoot}/versions
sudo chown -R ${sshUser}:${sshUser} ${projectHostRoot}
sudo -u ${sshUser} -H rm -rf ${projectHostDir}
sudo -u ${sshUser} -H mkdir -p ${projectHostDir}
sudo -u ${sshUser} -H tar -xJf ${seaRemote}  --strip-components=2 -C ${projectHostDir}
sudo -u ${sshUser} -H ln -sfn ${projectHostDir} ${projectHostCurrent}
sudo chown -R ${sshUser}:${sshUser} /btrfs/data || true
cd ${projectHostDir}
${
  cloudflaredServiceUnit
    ? `cat <<'EOF_CLOUDFLARED_SERVICE' | sudo tee /etc/systemd/system/cocalc-cloudflared.service >/dev/null
${cloudflaredServiceUnit}
EOF_CLOUDFLARED_SERVICE
sudo systemctl daemon-reload
sudo systemctl enable --now cocalc-cloudflared
`
    : ""
}
sudo -u ${sshUser} -H ${projectHostBin} daemon start
`;

  return {
    bootstrapScript,
    fetchSeaScript,
    fetchProjectBundleScript,
    fetchToolsScript,
    installServiceScript,
    publicUrl,
    internalUrl,
    sshServer,
    sshUser,
    seaRemote,
    resolvedSeaUrl,
    seaSha256,
    projectBundleUrl,
    projectBundleSha256,
    projectBundlesRoot,
    projectBundleDir,
    projectBundleRemote,
    toolsUrl,
    toolsSha256,
    toolsRoot,
    toolsDir,
    toolsRemote,
    tunnel,
  };
}

export async function buildBootstrapScriptWithStatus(
  row: ProjectHostRow,
  token: string,
  baseUrl: string,
): Promise<string> {
  const statusUrl = `${baseUrl}/project-host/bootstrap/status`;
  const conatUrl = `${baseUrl}/project-host/bootstrap/conat`;
  const conatPasswordCommand = `
if [ -f /btrfs/data/secrets/conat-password ]; then
  echo "bootstrap: conat password already present"
else
  echo "bootstrap: fetching conat password"
  curl -fsSL -H "Authorization: Bearer $BOOTSTRAP_TOKEN" "$CONAT_URL" | sudo tee /btrfs/data/secrets/conat-password >/dev/null
  sudo chmod 600 /btrfs/data/secrets/conat-password
fi
`;
  const scripts = await buildBootstrapScripts(row, {
    conatPasswordCommand,
    publicIpOverride: "$PUBLIC_IP",
    allowEnvVarExpansion: true,
  });
  if (!scripts.resolvedSeaUrl) {
    throw new Error("project host SEA URL not configured");
  }
  return `#!/bin/bash
set -euo pipefail
BOOTSTRAP_TOKEN="${token}"
STATUS_URL="${statusUrl}"
CONAT_URL="${conatUrl}"

report_status() {
  local status="$1"
  local message="\${2:-}"
  local payload
  json_escape() {
    local s="\$1"
    s="\${s//\\\\/\\\\\\\\}"
    s="\${s//\"/\\\\\"}"
    s="\${s//$'\\n'/\\\\n}"
    s="\${s//$'\\r'/\\\\r}"
    s="\${s//$'\\t'/\\\\t}"
    printf '%s' "\$s"
  }
  if [ -n "$message" ]; then
    local esc
    esc="$(json_escape "$message")"
    printf -v payload '{"status":"%s","message":"%s"}' "$status" "$esc"
  else
    printf -v payload '{"status":"%s"}' "$status"
  fi
  curl -fsSL -X POST -H "Authorization: Bearer $BOOTSTRAP_TOKEN" -H "Content-Type: application/json" \
    --data "$payload" \
    "$STATUS_URL" >/dev/null || true
}

on_error() {
  local code="$1"
  local line="$2"
  report_status "error" "bootstrap failed (exit \${code}) at line \${line}"
}
trap 'on_error "$?" "$LINENO"' ERR

report_status "running"
${scripts.bootstrapScript}
sudo -u ${scripts.sshUser} -H "$BOOTSTRAP_DIR/fetch-sea.sh"
sudo -u ${scripts.sshUser} -H "$BOOTSTRAP_DIR/fetch-project-bundle.sh"
sudo -u ${scripts.sshUser} -H "$BOOTSTRAP_DIR/fetch-tools.sh"
${scripts.installServiceScript}
sudo touch /btrfs/data/.bootstrap_done
report_status "done"
`;
}

export async function buildCloudInitStartupScript(
  _row: ProjectHostRow,
  token: string,
  baseUrl: string,
): Promise<string> {
  const bootstrapUrl = `${baseUrl}/project-host/bootstrap`;
  const statusUrl = `${baseUrl}/project-host/bootstrap/status`;
  return `#!/bin/bash
set -euo pipefail
BOOTSTRAP_TOKEN="${token}"
BOOTSTRAP_URL="${bootstrapUrl}"
STATUS_URL="${statusUrl}"
BOOTSTRAP_DIR="/root/bootstrap"

if ! command -v curl >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl
fi

mkdir -p "$BOOTSTRAP_DIR"
report_status() {
  local status="$1"
  local message="\${2:-}"
  local payload
  json_escape() {
    local s="\$1"
    s="\${s//\\\\/\\\\\\\\}"
    s="\${s//\"/\\\\\"}"
    s="\${s//$'\\n'/\\\\n}"
    s="\${s//$'\\r'/\\\\r}"
    s="\${s//$'\\t'/\\\\t}"
    printf '%s' "\$s"
  }
  if [ -n "$message" ]; then
    local esc
    esc="$(json_escape "$message")"
    printf -v payload '{"status":"%s","message":"%s"}' "$status" "$esc"
  else
    printf -v payload '{"status":"%s"}' "$status"
  fi
  curl -fsSL -X POST -H "Authorization: Bearer $BOOTSTRAP_TOKEN" -H "Content-Type: application/json" \
    --data "$payload" \
    "$STATUS_URL" >/dev/null || true
}

if ! curl -fsSL -H "Authorization: Bearer $BOOTSTRAP_TOKEN" "$BOOTSTRAP_URL" > "$BOOTSTRAP_DIR/bootstrap.sh"; then
  report_status "error" "bootstrap download failed"
  exit 1
fi
if ! bash "$BOOTSTRAP_DIR/bootstrap.sh" 2>&1 | tee "$BOOTSTRAP_DIR/bootstrap.log"; then
  report_status "error" "bootstrap execution failed"
  exit 1
fi
`;
}

async function fetchJson(url: string, redirects = 3): Promise<any> {
  const target = new URL(url);
  const client = target.protocol === "http:" ? http : https;
  return await new Promise((resolve, reject) => {
    const req = client.request(
      {
        method: "GET",
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers: { Accept: "application/json" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", async () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (status >= 300 && status < 400 && res.headers.location) {
            if (redirects <= 0) {
              reject(new Error(`SEA manifest redirect limit exceeded: ${url}`));
              return;
            }
            try {
              resolve(await fetchJson(res.headers.location, redirects - 1));
            } catch (err) {
              reject(err);
            }
            return;
          }
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `SEA manifest fetch failed (${status}): ${body.slice(0, 200)}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(
              new Error(`SEA manifest parse failed: ${(err as Error).message}`),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function resolveSoftwareArtifact(
  seaUrl: string,
  expected?: { os?: SoftwareOs; arch?: SoftwareArch },
): Promise<{
  url: string;
  sha256?: string;
}> {
  if (!seaUrl) return { url: "" };
  if (!seaUrl.endsWith(".json")) return { url: seaUrl };
  const manifest = await fetchJson(seaUrl);
  const manifestOs = normalizeOs(manifest?.os);
  const manifestArch = normalizeArch(manifest?.arch);
  if (expected?.os && manifestOs && manifestOs !== expected.os) {
    throw new Error(
      `SEA manifest OS mismatch: expected ${expected.os}, got ${manifestOs}`,
    );
  }
  if (expected?.arch && manifestArch && manifestArch !== expected.arch) {
    throw new Error(
      `SEA manifest arch mismatch: expected ${expected.arch}, got ${manifestArch}`,
    );
  }
  const url = typeof manifest?.url === "string" ? manifest.url : "";
  const sha256 =
    typeof manifest?.sha256 === "string" ? manifest.sha256 : undefined;
  if (!url) {
    throw new Error("SEA manifest missing url");
  }
  return { url, sha256 };
}

export async function handleBootstrap(row: ProjectHostRow) {
  logger.debug("handleBootstrap", { host_id: row.id });
  logger.info("handleBootstrap: skipped (cloud-init only)", {
    host_id: row.id,
  });
  return;
}
