import { listRows } from "./sqlite/database";
import { site_settings_conf as SITE_SETTINGS_CONF } from "@cocalc/util/schema";
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

function getSettingsRows(table: string): Record<string, any> {
  const rows = listRows(table);
  const out: Record<string, any> = {};
  for (const row of rows) {
    const { name, value } = row as { name?: string; value?: any };
    if (!name || !ALLOWED_SETTINGS.has(name)) continue;
    out[name] = value;
  }
  return out;
}

export async function getCustomizePayload(): Promise<CustomizePayload> {
  const configuration: Record<string, any> = {
    ...DEFAULT_CONFIGURATION,
    ...getSettingsRows("server_settings"),
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
