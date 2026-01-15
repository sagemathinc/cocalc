/*
Helpers for producing the public subset of site settings (used by /customize).
*/

import { site_settings_conf, type SiteSettingsKeys } from "./site-defaults";

export const PUBLIC_SITE_SETTINGS_KEYS = Object.freeze(
  Object.keys(site_settings_conf) as SiteSettingsKeys[],
);

const PUBLIC_SITE_SETTINGS_SET = new Set(PUBLIC_SITE_SETTINGS_KEYS);

type VersionSettings = {
  [key: string]: number;
};

function normalizeVersionValue(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : parseInt(String(value ?? "0"), 10);
  if (Number.isNaN(parsed) || parsed * 1000 >= Date.now()) {
    return 0;
  }
  return parsed;
}

export function isPublicSiteSettingKey(
  key: string,
): key is SiteSettingsKeys {
  return PUBLIC_SITE_SETTINGS_SET.has(key as SiteSettingsKeys);
}

export function buildPublicSiteSettings(all: Record<string, any>): {
  configuration: Record<string, any>;
  version: VersionSettings;
} {
  const configuration: Record<string, any> = {};
  const version: VersionSettings = {};

  for (const key of PUBLIC_SITE_SETTINGS_KEYS) {
    if (!(key in all)) {
      continue;
    }
    let value = all[key];
    if (key.startsWith("version_")) {
      value = normalizeVersionValue(value);
      version[key] = value;
    }
    configuration[key] = value;
  }

  if (all.pay_as_you_go_openai_markup_percentage != null) {
    configuration._llm_markup = all.pay_as_you_go_openai_markup_percentage;
  }

  const recommended =
    typeof configuration.version_recommended_browser === "number"
      ? configuration.version_recommended_browser
      : normalizeVersionValue(configuration.version_recommended_browser);
  const minBrowser =
    typeof configuration.version_min_browser === "number"
      ? configuration.version_min_browser
      : normalizeVersionValue(configuration.version_min_browser);
  const minProject =
    typeof configuration.version_min_project === "number"
      ? configuration.version_min_project
      : normalizeVersionValue(configuration.version_min_project);

  const boundedBrowser = Math.min(minBrowser || 0, recommended || 0);
  const boundedProject = Math.min(minProject || 0, recommended || 0);

  configuration.version_min_browser = boundedBrowser;
  configuration.version_min_project = boundedProject;
  version.version_min_browser = boundedBrowser;
  version.version_min_project = boundedProject;
  if (!Number.isNaN(recommended)) {
    version.version_recommended_browser = recommended;
  }

  return { configuration, version };
}
