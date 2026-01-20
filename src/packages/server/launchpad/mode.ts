import { getServerSettings } from "@cocalc/database/settings/server-settings";

export type LaunchpadMode = "unset" | "onprem" | "cloud";

const VALID_MODES: LaunchpadMode[] = ["unset", "onprem", "cloud"];

function normalizeMode(value?: string | null): LaunchpadMode {
  const mode = (value ?? "").trim().toLowerCase();
  if ((VALID_MODES as string[]).includes(mode)) {
    return mode as LaunchpadMode;
  }
  return "unset";
}

export async function getLaunchpadMode(): Promise<LaunchpadMode> {
  const envMode = process.env.COCALC_LAUNCHPAD_MODE;
  if (envMode) {
    return normalizeMode(envMode);
  }
  const settings = await getServerSettings();
  return normalizeMode(settings.launchpad_mode);
}

export async function requireLaunchpadModeSelected(): Promise<LaunchpadMode> {
  if (process.env.COCALC_MODE !== "launchpad") {
    return "cloud";
  }
  const mode = await getLaunchpadMode();
  if (mode === "unset") {
    throw new Error(
      "Launchpad mode not selected. Set Admin Settings → Launchpad Mode or COCALC_LAUNCHPAD_MODE.",
    );
  }
  return mode;
}

export type LaunchpadOnPremConfig = {
  mode: LaunchpadMode;
  https_port?: number;
  sshd_port?: number;
  sshpiperd_port?: number;
  proxy_prefix?: string;
  sftp_root?: string;
};

export function getLaunchpadOnPremConfig(
  modeOverride?: LaunchpadMode,
): LaunchpadOnPremConfig {
  const httpsPort = Number.parseInt(
    process.env.COCALC_HTTPS_PORT ?? process.env.PORT ?? "",
    10,
  );
  const sshdPort = Number.parseInt(process.env.COCALC_SSHD_PORT ?? "", 10);
  const sshpiperdPort = Number.parseInt(
    process.env.COCALC_SSHPIPERD_PORT ?? "",
    10,
  );
  const dataDir = process.env.COCALC_DATA_DIR ?? process.env.DATA;
  const sftpRoot =
    process.env.COCALC_SFTP_ROOT ??
    (dataDir ? `${dataDir}/backup-repo` : undefined);
  const proxyPrefix = process.env.COCALC_PROXY_PREFIX ?? "/host";

  return {
    mode: modeOverride ?? normalizeMode(process.env.COCALC_LAUNCHPAD_MODE),
    https_port: Number.isFinite(httpsPort) ? httpsPort : undefined,
    sshd_port: Number.isFinite(sshdPort) ? sshdPort : undefined,
    sshpiperd_port: Number.isFinite(sshpiperdPort) ? sshpiperdPort : undefined,
    proxy_prefix: proxyPrefix,
    sftp_root: sftpRoot,
  };
}
