/*
 * Project-host bootstrap lifecycle
 * - Cloud-init runs once on first boot using a short-lived token to fetch
 *   the bootstrap scripts + conat password from the hub.
 * - Bootstrap installs deps, prepares /btrfs, downloads the SEA, and starts
 *   the project-host daemon. It also installs a cron @reboot hook so the
 *   daemon restarts on every VM reboot without re-running bootstrap.
 * - SSH bootstrap remains as a fallback if cloud-init did not complete.
 * - cloudflared (if enabled) is managed by systemd and restarts on reboot.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
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

async function updateHostRow(id: string, updates: Record<string, any>) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((key, idx) => `${key}=$${idx + 2}`);
  await getPool().query(
    `UPDATE project_hosts SET ${sets.join(", ")}, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [id, ...keys.map((key) => updates[key])],
  );
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
  const projectHostManifestUrl = `${softwareBaseUrl}/project-host/latest.json`;
  const projectManifestUrl = `${softwareBaseUrl}/project/latest.json`;
  const toolsManifestUrl = `${softwareBaseUrl}/tools/latest.json`;
  const resolvedHostSea = await resolveSoftwareArtifact(projectHostManifestUrl);
  const resolvedSeaUrl = resolvedHostSea.url;
  const seaSha256 = (resolvedHostSea.sha256 ?? "").replace(/[^a-f0-9]/gi, "");
  const resolvedProjectBundle =
    await resolveSoftwareArtifact(projectManifestUrl);
  const projectBundleUrl = resolvedProjectBundle.url;
  const projectBundleSha256 = (resolvedProjectBundle.sha256 ?? "").replace(
    /[^a-f0-9]/gi,
    "",
  );
  const resolvedTools = await resolveSoftwareArtifact(toolsManifestUrl);
  const toolsUrl = resolvedTools.url;
  const toolsSha256 = (resolvedTools.sha256 ?? "").replace(/[^a-f0-9]/gi, "");
  const projectBundleVersion =
    extractArtifactVersion(projectBundleUrl, "project") || "latest";
  const projectBundlesRoot = "/opt/cocalc/project-bundles";
  const projectBundleDir = `${projectBundlesRoot}/${projectBundleVersion}`;
  const projectBundleRemote = "/opt/cocalc/project-bundle.tar.xz";
  const toolsVersion =
    extractArtifactVersion(toolsUrl, "tools") || "latest";
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
echo "bootstrap: updating apt package lists"
sudo apt-get update -y
echo "bootstrap: installing base packages"
sudo apt-get install -y podman btrfs-progs uidmap slirp4netns fuse-overlayfs curl xz-utils rsync vim crun cron
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
`;

  if (opts.conatPasswordCommand) {
    bootstrapScript += `\n${opts.conatPasswordCommand}\n`;
  }

  bootstrapScript += `
cat <<'EOF_COCALC_CTL' > "$BOOTSTRAP_DIR/ctl"
#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-status}"
bin="/opt/cocalc/project-host/cocalc-project-host"
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
echo 'tail -n 200 /btrfs/data/log' > "$BOOTSTRAP_DIR/logs"
chmod +x "$BOOTSTRAP_DIR/logs"

echo 'sudo journalctl -u cocalc-cloudflared.service' > "$BOOTSTRAP_DIR/logs-cf"
echo 'sudo systemctl \${1-status} cocalc-cloudflared' > "$BOOTSTRAP_DIR/ctl-cf"
chmod +x "$BOOTSTRAP_DIR/ctl-cf" "$BOOTSTRAP_DIR/logs-cf"

echo "bootstrap: configuring project-host autostart"
sudo tee /etc/cron.d/cocalc-project-host >/dev/null <<'EOF_COCALC_CRON'
@reboot ${sshUser} ${bootstrapDir}/ctl start
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

  if (cloudflaredScript) {
    bootstrapScript += cloudflaredScript;
  }

  const fetchSeaScript = `set -euo pipefail
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

  const fetchProjectBundleScript = `set -euo pipefail
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
  sudo mkdir -p "$BUNDLE_ROOT"
  sudo rm -rf "$BUNDLE_DIR"
  sudo mkdir -p "$BUNDLE_DIR"
  sudo tar -xJf "$BUNDLE_REMOTE" --strip-components=1 -C "$BUNDLE_DIR"
  sudo ln -sfn "$BUNDLE_DIR" "$BUNDLE_CURRENT"
`;
  const fetchToolsScript = `set -euo pipefail
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
  sudo mkdir -p "$TOOLS_ROOT"
  sudo rm -rf "$TOOLS_DIR"
  sudo mkdir -p "$TOOLS_DIR"
  sudo tar -xJf "$TOOLS_REMOTE" --strip-components=1 -C "$TOOLS_DIR"
  sudo ln -sfn "$TOOLS_DIR" "$TOOLS_CURRENT"
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
if [ -x /opt/cocalc/project-host/cocalc-project-host ]; then
  /opt/cocalc/project-host/cocalc-project-host daemon stop || true
fi
sudo systemctl disable --now cocalc-project-host >/dev/null 2>&1 || true
sudo rm -f /etc/systemd/system/cocalc-project-host.service || true
sudo rm -rf /opt/cocalc/project-host
sudo mkdir -p /opt/cocalc/project-host
sudo tar -xJf ${seaRemote}  --strip-components=2 -C /opt/cocalc/project-host
sudo chown -R ${sshUser}:${sshUser} /btrfs/data || true
cd /opt/cocalc/project-host
${cloudflaredServiceUnit ? `cat <<'EOF_CLOUDFLARED_SERVICE' | sudo tee /etc/systemd/system/cocalc-cloudflared.service >/dev/null
${cloudflaredServiceUnit}
EOF_CLOUDFLARED_SERVICE
sudo systemctl daemon-reload
sudo systemctl enable --now cocalc-cloudflared
` : ""}
sudo -u ${sshUser} -H /opt/cocalc/project-host/cocalc-project-host daemon start
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
  local payload
  printf -v payload '{"status":"%s"}' "$status"
  curl -fsSL -X POST -H "Authorization: Bearer $BOOTSTRAP_TOKEN" -H "Content-Type: application/json" \
    --data "$payload" \
    "$STATUS_URL" >/dev/null || true
}

report_status "running"
${scripts.bootstrapScript}
${scripts.fetchSeaScript}
${scripts.fetchProjectBundleScript}
${scripts.fetchToolsScript}
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
  return `#!/bin/bash
set -euo pipefail
BOOTSTRAP_TOKEN="${token}"
BOOTSTRAP_URL="${bootstrapUrl}"
BOOTSTRAP_DIR="/root/bootstrap"

if ! command -v curl >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl
fi

mkdir -p "$BOOTSTRAP_DIR"
curl -fsSL -H "Authorization: Bearer $BOOTSTRAP_TOKEN" "$BOOTSTRAP_URL" > "$BOOTSTRAP_DIR/bootstrap.sh"
bash "$BOOTSTRAP_DIR/bootstrap.sh" 2>&1 | tee "$BOOTSTRAP_DIR/bootstrap.log"
`;
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
              new Error(
                `SEA manifest parse failed: ${(err as Error).message}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function resolveSoftwareArtifact(seaUrl: string): Promise<{
  url: string;
  sha256?: string;
}> {
  if (!seaUrl) return { url: "" };
  if (!seaUrl.endsWith(".json")) return { url: seaUrl };
  const manifest = await fetchJson(seaUrl);
  const url = typeof manifest?.url === "string" ? manifest.url : "";
  const sha256 =
    typeof manifest?.sha256 === "string" ? manifest.sha256 : undefined;
  if (!url) {
    throw new Error("SEA manifest missing url");
  }
  return { url, sha256 };
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
  if (row.metadata?.bootstrap?.source !== "ssh") {
    return;
  }
  const { project_hosts_software_base_url } = await getServerSettings();
  const softwareBaseUrl = normalizeSoftwareBaseUrl(
    project_hosts_software_base_url ||
      process.env.COCALC_PROJECT_HOST_SOFTWARE_BASE_URL ||
      "",
  );
  const masterAddress =
    process.env.MASTER_CONAT_SERVER ??
    process.env.COCALC_MASTER_CONAT_SERVER ??
    "";
  if (!softwareBaseUrl) return;
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
  if (bootstrapStatus === "pending") {
    const pendingAtRaw = row.metadata?.bootstrap?.pending_at;
    const pendingAt = pendingAtRaw ? Date.parse(pendingAtRaw) : NaN;
    const ageMs = Number.isFinite(pendingAt)
      ? Date.now() - pendingAt
      : 0;
    if (!Number.isFinite(pendingAt) || ageMs < 10 * 60 * 1000) {
      return;
    }
  }
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
  if (row.metadata?.bootstrap?.source !== "ssh") {
    logger.info("handleBootstrap: skipped (cloud-init only)", {
      host_id: row.id,
    });
    return;
  }
  const runtime = row.metadata?.runtime;
  if (!runtime?.public_ip) {
    throw new Error("bootstrap requires public_ip");
  }
  const metadata = row.metadata ?? {};
  if (metadata.bootstrap?.status === "done") return;
  const machine: HostMachine = metadata.machine ?? {};
  const providerId = normalizeProviderId(machine.cloud);
  const publicIp = runtime.public_ip;
  const {
    bootstrapScript,
    fetchSeaScript,
    fetchProjectBundleScript,
    fetchToolsScript,
    installServiceScript,
    sshUser,
    publicUrl,
    internalUrl,
    tunnel,
  } = await buildBootstrapScripts(row);

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
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: fetchSeaScript,
      scriptPath: "$HOME/bootstrap/fetch-sea.sh",
    });
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: fetchProjectBundleScript,
      scriptPath: "$HOME/bootstrap/fetch-project-bundle.sh",
    });
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: fetchToolsScript,
      scriptPath: "$HOME/bootstrap/fetch-tools.sh",
    });
    await runSshScript({
      user: sshUser,
      host: publicIp,
      keyPath,
      knownHosts,
      script: installServiceScript,
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
