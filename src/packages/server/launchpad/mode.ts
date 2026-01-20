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
