import { listRows } from "./sqlite/database";
import { site_settings_conf as SITE_SETTINGS_CONF } from "@cocalc/util/schema";
import { buildPublicSiteSettings } from "@cocalc/util/db-schema/site-settings-public";
import { EXTRAS as SITE_SETTINGS_EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { keys } from "@cocalc/util/misc";

type CustomizePayload = {
  configuration: Record<string, any>;
  registration: boolean;
  strategies: any[];
  software: any;
  ollama: Record<string, any>;
  custom_openai: Record<string, any>;
};

const DEFAULT_CONFIGURATION = {
  lite: true,
  site_name: "CoCalc Lite",
  compute_servers_enabled: false,
  compute_servers_onprem_enabled: false,
  compute_servers_dns_enabled: false,
  compute_servers_dns: "",
  compute_servers_hyperstack_enabled: false,
  compute_servers_google_cloud_enabled: false,
  compute_servers_google_cloud_prefix: "",
  compute_servers_lambda_cloud_enabled: false,
  compute_servers_google: false,
  openai_enabled: false,
  google_vertexai_enabled: false,
  mistral_enabled: false,
  anthropic_enabled: false,
  custom_openai_enabled: false,
  ollama_enabled: false,
  agent_openai_control_agent_enabled: false,
  agent_openai_codex_enabled: false,
  jupyter_api_enabled: false,
  organization_name: "",
  organization_email: "",
  help_email: "",
  email_enabled: false,
  anonymous_signup: true,
  anonymous_signup_licensed_shares: true,
  share_server: true,
  i18n: ["en"],
  dns: "",
  country: "XX",
};

// Allow only site_settings & extras defined in the shared schema
const ALLOWED_SETTINGS = new Set(
  keys(SITE_SETTINGS_CONF).concat(keys(SITE_SETTINGS_EXTRAS)),
);

function getProcessedSettings(table: string): Record<string, any> {
  const rows = listRows(table) as { name?: string; value?: any }[];
  const allRaw: Record<string, any> = {};
  for (const { name, value } of rows) {
    if (name) allRaw[name] = value;
  }

  const out: Record<string, any> = {};

  for (const { name, value } of rows) {
    if (!name || !ALLOWED_SETTINGS.has(name)) continue;
    const spec = SITE_SETTINGS_CONF[name] ?? SITE_SETTINGS_EXTRAS[name];
    if (typeof spec?.to_val === "function") {
      out[name] = spec.to_val(value, allRaw);
    } else {
      out[name] = value;
    }
  }

  // fill defaults for missing fields
  for (const config of [SITE_SETTINGS_CONF, SITE_SETTINGS_EXTRAS]) {
    for (const name in config) {
      if (!ALLOWED_SETTINGS.has(name)) continue;
      if (out[name] != null) continue;
      const spec = (config as any)[name];
      const fallback =
        typeof spec?.to_val === "function"
          ? spec.to_val(spec.default, allRaw)
          : spec.default;
      if (
        (typeof fallback === "string" && fallback === "") ||
        (Array.isArray(fallback) && fallback.length === 0)
      ) {
        continue;
      }
      out[name] = fallback;
    }
  }

  return out;
}

export function getLiteServerSettings(): Record<string, any> {
  return getProcessedSettings("server_settings");
}

export async function getCustomizePayload(): Promise<CustomizePayload> {
  const allSettings = getProcessedSettings("server_settings");
  const { configuration: publicSettings } = buildPublicSiteSettings(allSettings);
  const configuration: Record<string, any> = {
    ...DEFAULT_CONFIGURATION,
    ...publicSettings,
  };

  return {
    configuration,
    registration: false,
    strategies: [],
    software: null,
    ollama: {},
    custom_openai: {},
  };
}
