/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Site Settings Config for the servers (hubs)
// They are only visible and editable for admins and services.
// In particular, this includes the email backend config, Stripe, etc.

// You can use markdown in the descriptions below and it is rendered properly!

import { isEmpty } from "lodash";

import {
  expire_time,
  isValidUUID,
  is_valid_email_address,
} from "@cocalc/util/misc";
import {
  Config,
  SiteSettings,
  displayJson,
  from_json,
  is_email_enabled,
  onlyNonnegFloat,
  onlyPosFloat,
  only_booleans,
  only_cocalc_com,
  only_commercial,
  only_for_password_reset_smtp,
  only_for_sendgrid,
  only_for_smtp,
  only_nonneg_int,
  only_pos_int,
  parsableJson,
  toFloat,
  to_bool,
  to_int,
  to_trimmed_str,
} from "./site-defaults";

export const pii_retention_parse = (retention: string): number | false => {
  if (retention == "never" || retention == null) return false;
  const [num_str, mult_str] = retention.split(" ");
  const num = parseInt(num_str);
  const mult = (function () {
    const m = mult_str.toLowerCase();
    if (m.startsWith("year")) return 365;
    if (m.startsWith("month")) return 30;
    if (m.startsWith("day")) return 1;
    throw new Error(`unknown multiplyer "${m}"`);
  })();
  const secs = num * (mult * 24 * 60 * 60);
  if (isNaN(secs) || secs == null) {
    throw new Error(
      `pii_expire problem: cannot derive future time from "{retention}"`,
    );
  }
  return secs;
};

const pii_retention_display = (retention: string) => {
  const secs = pii_retention_parse(retention);
  if (secs === false) {
    return "will never expire";
  } else {
    return `Future date ${expire_time(secs).toLocaleString()}`;
  }
};

const openai_enabled = (conf: SiteSettings) => to_bool(conf.openai_enabled);
const vertexai_enabled = (conf: SiteSettings) =>
  to_bool(conf.google_vertexai_enabled);
const mistral_enabled = (conf: SiteSettings) => to_bool(conf.mistral_enabled);
const anthropic_enabled = (conf: SiteSettings) =>
  to_bool(conf.anthropic_enabled);
const ollama_enabled = (conf: SiteSettings) => to_bool(conf.ollama_enabled);
const custom_openai_enabled = (conf: SiteSettings) =>
  to_bool(conf.custom_openai_enabled);
const xai_enabled = (conf: SiteSettings) => to_bool(conf.xai_enabled);
const any_llm_enabled = (conf: SiteSettings) =>
  openai_enabled(conf) ||
  vertexai_enabled(conf) ||
  ollama_enabled(conf) ||
  mistral_enabled(conf);

const compute_servers_enabled = (conf: SiteSettings) =>
  to_bool(conf.compute_servers_enabled);
const compute_servers_google_enabled = (conf: SiteSettings) =>
  to_bool(conf["compute_servers_google-cloud_enabled"]);
// const compute_servers_lambda_enabled = (conf: SiteSettings) =>
//   to_bool(conf["compute_servers_lambda-cloud_enabled"]);
const compute_servers_hyperstack_enabled = (conf: SiteSettings) =>
  to_bool(conf["compute_servers_hyperstack_enabled"]);

const jupyter_api_enabled = (conf: SiteSettings) =>
  to_bool(conf.jupyter_api_enabled);

// Ollama and Custom OpenAI have the same schema
function custom_llm_valid(value: string): boolean {
  if (isEmpty(value) || !parsableJson(value)) {
    return false;
  }
  const obj = from_json(value);
  if (typeof obj !== "object") {
    return false;
  }
  for (const key in obj) {
    const val = obj[key] as any;
    if (typeof val !== "object") {
      return false;
    }
    if (typeof val.baseUrl !== "string") {
      return false;
    }
    if (val.model && typeof val.model !== "string") {
      return false;
    }
    const c = val.cocalc;
    if (c != null) {
      if (typeof c !== "object") {
        return false;
      }
      if (c.display && typeof c.display !== "string") {
        return false;
      }
      if (c.desc && typeof c.desc !== "string") {
        return false;
      }
      if (c.enabled && typeof c.enabled !== "boolean") {
        return false;
      }
    }
  }
  return true;
}

// Ollama and Custom OpenAI have the same schema
function custom_llm_display(value: string): string {
  const structure =
    "Must be {[key : string] : {model: string, baseUrl: string, cocalc?: {display?: string, desc?: string, icon?: string, ...}, ...}";
  if (isEmpty(value)) {
    return `Empty. ${structure}`;
  }
  if (!parsableJson(value)) {
    return `JSON not parseable. ${structure}`;
  }
  const obj = from_json(value);
  if (typeof obj !== "object") {
    return "JSON must be an object";
  }
  const ret: string[] = [];
  for (const key in obj) {
    const val = obj[key] as any;
    if (typeof val !== "object") {
      return `Config object in ${key} must be an object`;
    }
    if (typeof val.baseUrl !== "string") {
      return `Config ${key} baseUrl field must be a string`;
    }
    if (val.model && typeof val.model !== "string") {
      return `Config ${key} model field must be a string`;
    }
    const c = val.cocalc;
    if (c != null) {
      if (typeof c !== "object") {
        return `Config ${key} cocalc field must be an object: {display?: string, desc?: string, enabled?: boolean, ...}`;
      }
      if (c.display && typeof c.display !== "string") {
        return `Config ${key} cocalc.display field must be a string`;
      }
      if (c.desc && typeof c.desc !== "string") {
        return `Config ${key} cocalc.desc field must be a (markdown) string`;
      }
      if (c.enabled && typeof c.enabled !== "boolean") {
        return `Config ${key} cocalc.enabled field must be a boolean`;
      }
    }
    ret.push(
      `Olama ${key} at ${val.baseUrl} named ${c?.display ?? val.model ?? key}`,
    );
  }
  return `[${ret.join(", ")}]`;
}

export type SiteSettingsExtrasKeys =
  | "pii_retention"
  | "analytics_cookie"
  | "conat_heading"
  | "conat_password"
  | "stripe_heading"
  | "stripe_publishable_key"
  | "stripe_secret_key"
  | "stripe_webhook_secret"
  | "re_captcha_v3_heading"
  | "re_captcha_v3_publishable_key"
  | "re_captcha_v3_secret_key"
  | "email_section"
  | "email_backend"
  | "sendgrid_key"
  | "email_smtp_server"
  | "email_smtp_from"
  | "email_smtp_login"
  | "email_smtp_password"
  | "email_smtp_port"
  | "email_smtp_secure"
  | "openai_section"
  | "openai_api_key"
  | "google_vertexai_key"
  | "ollama_configuration"
  | "custom_openai_configuration"
  | "mistral_api_key"
  | "anthropic_api_key"
  | "xai_api_key"
  | "salesloft_section"
  | "salesloft_api_key"
  | "jupyter_section"
  | "jupyter_account_id"
  | "jupyter_project_pool_size"
  | "password_reset_override"
  | "password_reset_smtp_server"
  | "password_reset_smtp_from"
  | "password_reset_smtp_login"
  | "password_reset_smtp_password"
  | "password_reset_smtp_port"
  | "password_reset_smtp_secure"
  | "zendesk_heading"
  | "zendesk_token"
  | "zendesk_username"
  | "zendesk_uri"
  | "support_account_id"
  | "github_heading"
  | "github_project_id"
  | "github_username"
  | "github_token"
  | "github_block"
  | "prometheus_metrics"
  | "pay_as_you_go_section"
  | "pay_as_you_go_spending_limit"
  | "pay_as_you_go_spending_limit_with_verified_email"
  | "pay_as_you_go_spending_limit_with_credit"
  | "pay_as_you_go_min_payment"
  | "pay_as_you_go_openai_markup_percentage"
  | "pay_as_you_go_max_project_upgrades"
  | "pay_as_you_go_price_project_upgrades"
  | "compute_servers_section"
  | "compute_servers_markup_percentage"
  //  | "lambda_cloud_api_key"
  | "hyperstack_api_key"
  | "hyperstack_compute_servers_prefix"
  | "hyperstack_compute_servers_markup_percentage"
  | "hyperstack_ssh_public_key"
  | "hyperstack_balance_alert_thresh"
  | "hyperstack_balance_alert_emails"
  | "google_cloud_service_account_json"
  | "google_cloud_bigquery_billing_service_account_json"
  | "google_cloud_bigquery_detailed_billing_table"
  | "google_cloud_compute_servers_prefix"
  | "google_cloud_compute_servers_image_prefix"
  | "compute_servers_cloudflare_api_key"
  | "compute_servers_images_spec_url"
  //   | "coreweave_kubeconfig"
  //   | "fluidstack_api_key"
  //   | "fluidstack_api_token"
  //   | "amazon_web_services_access_key"
  //   | "amazon_web_services_secret_access_key"
  //   | "fluidstack_api_token"
  | "subscription_maintenance";

export type SettingsExtras = Record<SiteSettingsExtrasKeys, Config>;

const DEFAULT_COMPUTE_SERVER_IMAGES_JSON =
  "https://raw.githubusercontent.com/sagemathinc/cocalc-compute-docker/main/images.json";

// not public, but admins can edit them
export const EXTRAS: SettingsExtras = {
  conat_heading: {
    name: "Conat Configuration",
    desc: "Conat is a [NATS](https://nats.io/)-like [socketio](https://socket.io/) websocket server and persistence layer that CoCalc uses extensively for communication.",
    default: "",
    type: "header",
    tags: ["Conat"],
  },
  conat_password: {
    name: "Conat Password",
    desc: "Password for conat *hub* admin account. If not given, then the contents of the file `$SECRETS/conat_password` (or `$COCALC_ROOT/data/secrets/conat_password`) is used, if it exists.",
    default: "",
    password: true,
    tags: ["Conat"],
  },
  openai_section: {
    name: "Language Model Configuration",
    desc: "",
    default: "",
    show: any_llm_enabled,
    type: "header",
    tags: ["AI LLM", "OpenAI"],
  },
  openai_api_key: {
    name: "OpenAI API Key",
    desc: "Your OpenAI API Key from https://platform.openai.com/account/api-keys.  This key is needed to support functionality that uses OpenAI's API.",
    default: "",
    password: true,
    show: openai_enabled,
    tags: ["AI LLM", "OpenAI"],
  },
  google_vertexai_key: {
    name: "Google Generative AI API Key",
    desc: "Create an [API Key](https://aistudio.google.com/app/apikey) in [Google's AI Studio](https://aistudio.google.com/) and paste it here.",
    default: "",
    password: true,
    show: vertexai_enabled,
    tags: ["AI LLM", "OpenAI"],
  },
  mistral_api_key: {
    name: "Mistral AI API Key",
    desc: "Create an API Key in the [Mistral AI Console](https://console.mistral.ai/api-keys/) and paste it here.",
    default: "",
    password: true,
    show: mistral_enabled,
    tags: ["AI LLM"],
  },
  anthropic_api_key: {
    name: "Anthropic API Key",
    desc: "Create an API Key in the [Anthropic Console](https://console.anthropic.com/) and paste it here.",
    default: "",
    password: true,
    show: anthropic_enabled,
    tags: ["AI LLM"],
  },
  xai_api_key: {
    name: "xAI API Key",
    desc: "Create an API Key in the [xAI Console](https://console.x.ai/) and paste it here.",
    default: "",
    password: true,
    show: xai_enabled,
    tags: ["AI LLM"],
  },
  ollama_configuration: {
    name: "Ollama Configuration",
    desc: 'Configure Ollama endpoints. e.g. Ollama has "gemma" installed and is available at localhost:11434: `{"gemma" : {"baseUrl": "http://localhost:11434/" , cocalc: {display: "Gemma", desc: "Google\'s Gemma Model", icon: "https://.../...png"}}`',
    default: "{}",
    multiline: 5,
    show: ollama_enabled,
    to_val: from_json,
    valid: custom_llm_valid,
    to_display: custom_llm_display,
    tags: ["AI LLM"],
  },
  // This is very similar to the ollama config, but there are small differences in the details.
  custom_openai_configuration: {
    name: "Custom OpenAI Endpoints",
    desc: 'Configure OpenAI endpoints, queried via [@langchain/openai (Node.js)](https://js.langchain.com/v0.1/docs/integrations/llms/openai/). e.g. `{"myllm" : {"baseUrl": "http://1.2.3.4:5678/" , apiKey: "key...", cocalc: {display: "My LLM", desc: "My custom LLM", icon: "https://.../...png"}}, "gpt-4o-high": {baseUrl: "https://api.openai.com/v1", temperature: 1.5, "apiKey": "sk-...", "model": "gpt-4o", cocalc: {display: "High GPT-4 Omni", desc: "GPT 4 Omni High Temp"}}}`',
    default: "{}",
    multiline: 5,
    show: custom_openai_enabled,
    to_val: from_json,
    valid: custom_llm_valid,
    to_display: custom_llm_display,
    tags: ["AI LLM"],
  },
  salesloft_section: {
    name: "Salesloft Configuration",
    desc: "",
    default: "",
    show: only_cocalc_com,
    type: "header",
  },
  salesloft_api_key: {
    name: "Salesloft API key (needed for Salesloft integration)",
    desc: "Your API key, which is needed to connect for some functionality related to [the Salesloft API](https://developers.salesloft.com/docs/api).",
    default: "",
    password: true,
    show: only_cocalc_com,
  },
  jupyter_section: {
    name: "Jupyter API Configuration",
    desc: "",
    default: "",
    show: jupyter_api_enabled,
    type: "header",
    tags: ["Jupyter"],
  },
  jupyter_account_id: {
    name: "Jupyter API Account Id",
    desc: "account_id of an account on this server that will own a pool of projects used for the public facing Jupyter API, if it is enabled.  You can look up the account_id of an existing user in the Users section above. This account does NOT have to have any special privileges.",
    default: "",
    valid: isValidUUID,
    show: jupyter_api_enabled,
    tags: ["Jupyter"],
  },
  jupyter_project_pool_size: {
    name: "Jupyter API Project Pool Size",
    desc: "The number of distinct projects that will run generic user code evaluation on the landing pages (not in projects).",
    default: "3",
    to_val: to_int,
    valid: only_pos_int,
    show: jupyter_api_enabled,
    tags: ["Jupyter"],
  },
  pii_retention: {
    name: "PII Retention",
    desc: "How long to keep personally identifiable information, after which the server automatically deletes certain database entries that contain PII.",
    default: "never",
    // values must be understood by packages/hub/utils.ts pii_expire
    valid: [
      "never",
      "30 days",
      "3 month",
      "6 month",
      "1 year",
      "2 years",
      "5 years",
      "10 years",
    ],
    to_val: pii_retention_parse,
    to_display: pii_retention_display,
  },
  analytics_cookie: {
    name: "Analytics Cookie",
    desc: "Tag browser sessions visiting a website via an analytics.js script with a cookie",
    default: "no",
    valid: only_booleans,
    to_val: to_bool,
  },
  stripe_heading: {
    // this is consmetic, otherwise it looks weird.
    name: "Stripe Keys",
    desc: "",
    default: "",
    show: only_commercial,
    type: "header",
    tags: ["Stripe"],
  },
  stripe_publishable_key: {
    name: "Stripe Publishable",
    desc: "Stripe calls this key 'publishable'",
    default: "",
    password: false,
    show: only_commercial,
    tags: ["Stripe"],
  },
  stripe_secret_key: {
    name: "Stripe Secret",
    desc: "Stripe calls this key 'secret'",
    default: "",
    show: only_commercial,
    password: true,
    tags: ["Stripe"],
  },
  stripe_webhook_secret: {
    name: "Stripe Webhook Secret",
    desc: "The stripe webhook secret, which is used to verify the signature for stripe webhooks events, and should look like 'whsec_fibl8xlfp...'.  For this to work, you must enable stripe webhooks at https://dashboard.stripe.com/webhooks with a URL like `https://my-cocalc-server/webhooks/stripe`.   The actual webhook events we use are: invoice.paid, payment_intent.succeeded, customer.subscription.created; you can enable all webhooks and things still work, but it is less efficient.  See https://github.com/sagemathinc/cocalc/blob/master/src/packages/hub/servers/app/webhooks/stripe.ts",
    default: "",
    show: only_commercial,
    password: true,
    tags: ["Stripe"],
  },
  re_captcha_v3_heading: {
    // this is cosmetic, otherwise it looks weird.
    name: "reCaptcha v3 Keys",
    desc: "You get these from https://www.google.com/recaptcha/intro/v3.html .  They make it so it is more difficult for robots to create accounts on your server.  Users never have to explicitly solve a captcha.",
    default: "",
    show: only_commercial,
    type: "header",
    tags: ["captcha"],
  },
  re_captcha_v3_publishable_key: {
    name: "reCaptcha v3 Site Key",
    desc: "",
    default: "",
    password: false,
    show: only_commercial,
    tags: ["captcha"],
  },
  re_captcha_v3_secret_key: {
    name: "reCaptcha v3 Secret Key",
    desc: "",
    default: "",
    show: only_commercial,
    password: true,
    tags: ["captcha"],
  },
  zendesk_heading: {
    name: "Zendesk API Configuration",
    desc: "",
    default: "",
    type: "header",
    tags: ["Zendesk", "Support"],
  },
  zendesk_token: {
    name: "Zendesk Token",
    desc: "This is the API Token in Zendesk; see their Admin --> API page.",
    default: "",
    password: true,
    show: () => true,
    tags: ["Zendesk", "Support"],
  },
  zendesk_username: {
    name: "Zendesk Username",
    desc: "This is the username for Zendesk.  E.g., for `cocalc.com` it is `support-agent@cocalc.com`",
    default: "",
    show: () => true,
    tags: ["Zendesk", "Support"],
  },
  zendesk_uri: {
    name: "Zendesk Subdomain",
    desc: "This is the Subdomain of your Zendesk server.  E.g., for `cocalc.com` it is `sagemathcloud`",
    default: "",
    show: () => true,
    tags: ["Zendesk", "Support"],
  },
  support_account_id: {
    name: "Support CoCalc Account ID",
    desc: "The account_id of a special account that will be used for systemwide support messages in CoCalc.  E.g., when users receive an internal message about billing, this is the account the message will come from.",
    default: "",
    valid: isValidUUID,
    tags: ["Support"],
  },
  github_heading: {
    name: "GitHub API Configuration",
    desc: "CoCalc can mirror content from  GitHub at `https://yoursite.com/github/[url to github]`. This is just like what https://nbviewer.org does.",
    default: "",
    type: "header",
    tags: ["GitHub"],
  },
  github_project_id: {
    name: "GitHub Project ID",
    desc: "If this is set to a `project_id` (a UUID v4 of a project on your server), then the share server will proxy GitHub URL's.  For example, when a user visits https://yoursite.com/github/sagemathinc/cocalc they see a rendered version.  They can star the repo from cocalc, edit it in cocalc, etc.  This extends your CoCalc server to provide similar functionality to what nbviewer.org provides.  Optionally set a GitHub username and personal access token below to massively increase GitHub's API rate limits.",
    default: "",
    valid: isValidUUID,
    tags: ["GitHub"],
  },
  github_username: {
    name: "GitHub Username",
    desc: "This is a username for a GitHub Account.",
    default: "",
    show: () => true,
    tags: ["GitHub"],
  },
  github_token: {
    name: "GitHub Token",
    desc: "This is a Personal Access token for the above GitHub account.  You can get one at https://github.com/settings/tokens -- you do not have to enable any scopes -- it used only to increase rate limits from 60/hour to 5000/hour.",
    default: "",
    password: true,
    show: () => true,
    tags: ["GitHub"],
  },
  github_block: {
    name: "GitHub Abuse Block",
    desc: "In case of **abuse**, you can block proxying of any GitHub URL that contains any string in this comma separated list.",
    default: "",
    show: () => true,
    tags: ["GitHub"],
  },
  email_section: {
    name: "Email Configuration",
    desc: "",
    default: "",
    type: "header",
    tags: ["Email"],
  },
  email_backend: {
    name: "Email backend type",
    desc: "The type of backend for sending emails ('none' means there is none).",
    default: "",
    valid: ["none", "sendgrid", "smtp"],
    show: () => true,
    tags: ["Email"],
  },
  sendgrid_key: {
    name: "Sendgrid API key (for email)",
    desc: "You need a Sendgrid account and then enter a valid API key here",
    password: true,
    default: "",
    show: only_for_sendgrid,
    tags: ["Email"],
  },
  email_smtp_server: {
    name: "SMTP server (for email)",
    desc: "the hostname to talk to",
    default: "",
    show: only_for_smtp,
    tags: ["Email"],
  },
  email_smtp_from: {
    name: "SMTP server FROM (for email)",
    desc: "the FROM and REPLYTO email address",
    default: "",
    valid: is_valid_email_address,
    show: only_for_smtp,
    tags: ["Email"],
  },
  email_smtp_login: {
    name: "SMTP username (for email)",
    desc: "the username, for PLAIN login",
    default: "",
    show: only_for_smtp,
    tags: ["Email"],
  },
  email_smtp_password: {
    name: "SMTP password (for email)",
    desc: "the password, for PLAIN login",
    default: "",
    show: only_for_smtp,
    password: true,
    tags: ["Email"],
  },
  email_smtp_port: {
    name: "SMTP port (for email)",
    desc: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    to_val: to_int,
    valid: only_nonneg_int,
    show: only_for_smtp,
    tags: ["Email"],
  },
  email_smtp_secure: {
    name: "SMTP secure (for email)",
    desc: "Usually 'true'",
    default: "true",
    valid: only_booleans,
    to_val: to_bool,
    show: only_for_smtp,
    tags: ["Email"],
  },
  // bad name, historic baggage, used in packages/hub/email.ts
  password_reset_override: {
    name: "Override email backend",
    desc: "For 'smtp', password reset and email verification emails are sent via the 'Secondary SMTP' configuration",
    default: "default",
    valid: ["default", "smtp"],
    show: is_email_enabled,
    tags: ["Email"],
  },
  password_reset_smtp_server: {
    name: "Secondary SMTP server (for email)",
    desc: "hostname sending password reset emails",
    default: "",
    show: only_for_password_reset_smtp,
    tags: ["Email"],
  },
  password_reset_smtp_from: {
    name: "Secondary SMTP FROM (for email)",
    desc: "This sets the FROM and REPLYTO email address",
    default: "",
    valid: is_valid_email_address,
    show: only_for_password_reset_smtp,
    tags: ["Email"],
  },
  password_reset_smtp_login: {
    name: "Secondary SMTP username (for email)",
    desc: "username, PLAIN auth",
    default: "",
    show: only_for_password_reset_smtp,
    tags: ["Email"],
  },
  password_reset_smtp_password: {
    name: "Secondary SMTP password (for email)",
    desc: "password, PLAIN auth",
    default: "",
    show: only_for_password_reset_smtp,
    password: true,
    tags: ["Email"],
  },
  password_reset_smtp_port: {
    name: "Secondary SMTP port (for email)",
    desc: "Usually: For secure==true use port 465, otherwise port 587 or 25",
    default: "465",
    to_val: to_int,
    valid: only_nonneg_int,
    show: only_for_password_reset_smtp,
    tags: ["Email"],
  },
  password_reset_smtp_secure: {
    name: "Secondary SMTP secure (for email)",
    desc: "Usually 'true'",
    default: "true",
    valid: only_booleans,
    to_val: to_bool,
    show: only_for_password_reset_smtp,
    tags: ["Email"],
  },
  prometheus_metrics: {
    name: "Prometheus Metrics",
    desc: "Make [Prometheus metrics](https://prometheus.io/) available at `/metrics`. (Wait one minute after changing this setting for it to take effect.)",
    default: "no",
    valid: only_booleans,
    to_val: to_bool,
  },
  pay_as_you_go_section: {
    name: "Pay as you Go",
    desc: "",
    default: "",
    show: only_commercial,
    type: "header",
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_spending_limit: {
    name: "Initial Pay As You Go Spending Limit",
    desc: "The initial default pay as you go spending limit that all accounts get, in dollars.",
    default: "0",
    show: only_commercial,
    to_val: toFloat,
    valid: onlyNonnegFloat,
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_min_payment: {
    name: "Pay As You Go - Minimum Payment",
    desc: "The minimum transaction size that a user can pay towards their pay-as-you-go balance, in dollars.",
    default: "2.50",
    show: only_commercial,
    to_val: toFloat,
    valid: onlyPosFloat,
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_openai_markup_percentage: {
    name: "Pay As You Go - LLM Markup Percentage",
    desc: "The markup percentage that we add to the LLM's call rate.  This accounts for maintenance, dev, servers, and bandwidth. For example, '30' would mean we add 30% to the price that OpenAI charges us.",
    default: "30",
    show: only_commercial,
    to_val: toFloat,
    valid: onlyNonnegFloat,
    tags: ["AI LLM", "OpenAI", "Pay as you Go"],
  },
  pay_as_you_go_max_project_upgrades: {
    name: "Pay As You Go - Max Project Upgrade Quotas",
    desc: 'Example -- `{"network": 1, "member_host": 1, "always_running": 1, "cores": 3, "memory": 16000, "disk_quota": 15000}`. This is a json object, and the units are exactly as in the quota editor (so true/false, cores and megabytes).',
    default:
      '{"network": 1, "member_host": 1, "always_running": 1, "cores": 3, "memory": 16000, "disk_quota": 15000}',
    show: only_commercial,
    to_val: from_json,
    to_display: displayJson,
    valid: parsableJson,
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_price_project_upgrades: {
    name: "Pay As You Go - Price for Project Upgrades",
    desc: 'Example -- `{"cores":32, "memory":4, "disk_quota":0.25, "member_host":4}`. This is a json object, where\n\n- cores = price per month for 1 vCPU\n- memory = price per month for 1GB of RAM\n- disk_quota = price per month for 1GB of disk\n- member_host = non-disk part of non-member hosting cost is divided by this',
    default: '{"cores":32, "memory":4, "disk_quota":0.25, "member_host":4}',
    show: only_commercial,
    to_val: from_json,
    to_display: displayJson,
    valid: parsableJson,
    tags: ["Pay as you Go"],
  },
  subscription_maintenance: {
    name: "Pay As You Go - Subscription Maintenance Parameters",
    desc: 'Example -- {"request":6, "renew":1, "grace":3}" -- which means:\n\n- **request:** request payment 6 days before the subscription ends with instructions to renew or cancel\n- **renew:** automatically attempt renewal 1 day before subscription ends by debiting account if there is credit in the account\n- **grace:** provide a grace period of 3 days before actually cancelling the subscription and ending the license (user will get charged for those 3 days)',
    default: '{"request":6, "renew":1, "grace":3}',
    show: only_commercial,
    to_val: from_json,
    to_display: displayJson,
    valid: parsableJson,
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_spending_limit_with_verified_email: {
    name: "Pay As You Go Spending Limit with Verified Email",
    desc: "(NOT CURRENTLY USED) The pay as you go spending limit for accounts with a verified email address.",
    default: "5",
    show: only_commercial,
    to_val: toFloat,
    valid: onlyNonnegFloat,
    tags: ["Pay as you Go"],
  },
  pay_as_you_go_spending_limit_with_credit: {
    name: "Pay As You Go Spending Limit with Credit",
    desc: "(NOT CURRENTLY USED) The pay as you go spending limit for accounts that have ever successfully had a positive credit.",
    default: "15",
    show: only_commercial,
    to_val: toFloat,
    valid: onlyNonnegFloat,
    tags: ["Pay as you Go"],
  },
  compute_servers_section: {
    name: "Cloud Compute Service Providers",
    desc: "Configure the cloud services that provide computer servers.",
    default: "",
    show: compute_servers_enabled,
    type: "header",
    tags: ["Compute Servers"],
  },
  compute_servers_markup_percentage: {
    name: "Compute Servers - Markup Percentage",
    desc: "The default markup percentage that we add to the cost we pay to the cloud service providers.  This accounts for maintenance, dev, servers, and *bandwidth* (which can be massive). For example, '30' would mean we add 30% to the price that the cloud service provides charge us for compute, and we currently gamble regarding bandwidth costs.  There may be more customized pricing and markups for specific providers configured elsewhere.",
    default: "30",
    show: (conf) => only_commercial(conf) && compute_servers_enabled(conf),
    to_val: toFloat,
    valid: onlyNonnegFloat,
    tags: ["Compute Servers"],
  },
  hyperstack_api_key: {
    name: "Compute Servers: Hyperstack - API Key",
    desc: "Your [Hyperstack API Key](https://console.hyperstack.cloud/api-keys).  This supports managing compute servers on the [Hyperstack Cloud](https://www.hyperstack.cloud/).  REQUIRED or Hyperstack will not work.",
    default: "",
    password: true,
    show: compute_servers_hyperstack_enabled,
    tags: ["Compute Servers", "Hyperstack"],
  },
  hyperstack_compute_servers_prefix: {
    name: "Compute Servers: Hyperstack - Resource Prefix",
    desc: "Prepend this string to all Hyperstack resources that are created, e.g., VM names, disks, etc.  If the prefix is 'cocalc', then the compute server with id 17 will be called 'cocalc-17'.  REQUIRED or Hyperstack will not work.",
    default: "cocalc",
    to_val: to_trimmed_str,
    show: compute_servers_hyperstack_enabled,
    tags: ["Compute Servers", "Hyperstack"],
  },
  hyperstack_compute_servers_markup_percentage: {
    name: "Compute Servers: Hyperstack - Markup Percentage",
    desc: "Markup percentage specifically for hyperstack.  If not given (i.e., empty string), the global compute server markup is used.  This is always the markup on the public list price, and has nothing to do with negotiated wholesale pricing.",
    default: "",
    show: compute_servers_hyperstack_enabled,
    to_val: to_trimmed_str,
    valid: () => true,
    tags: ["Compute Servers", "Hyperstack"],
  },
  hyperstack_ssh_public_key: {
    name: "Compute Servers: Hyperstack - Public SSH Key",
    desc: "A public SSH key that grants access to all Hyperstack VM's for admin and debugging purposes.  REQUIRED or Hyperstack will not work.",
    default: "",
    password: true,
    show: compute_servers_hyperstack_enabled,
    tags: ["Compute Servers", "Hyperstack"],
  },
  hyperstack_balance_alert_thresh: {
    name: "Compute Servers: Hyperstack - Balance Alert Threshold",
    desc: "If your credit balance goes below this amount on the Hyperstack site, then you will be emailed (assuming email is configured).",
    default: "25",
    to_val: to_int,
    show: compute_servers_hyperstack_enabled,
    tags: ["Compute Servers", "Hyperstack"],
  },
  hyperstack_balance_alert_emails: {
    name: "(DEPRECATED) Compute Servers: Hyperstack - Balance Email Addresses",
    desc: "If your credit balance goes below your configured threshold, then these email addresses will get an alert message.  Separate addresses by commas.",
    default: "",
    show: compute_servers_hyperstack_enabled,
    tags: ["Compute Servers", "Hyperstack"],
  },

  //   lambda_cloud_api_key: {
  //     name: "Compute Servers: Lambda Cloud - API Key (not implemented)",
  //     desc: "Your [Lambda Cloud](https://lambdalabs.com/service/gpu-cloud) API Key from https://cloud.lambdalabs.com/api-keys.  This supports managing compute servers on Lambda Cloud.  WARNING: Lambda Cloud integration is not yet useful for anything.",
  //     default: "",
  //     password: true,
  //     show: compute_servers_lambda_enabled,
  //   },
  //   coreweave_kubeconfig: {
  //     name: "Compute Servers: CoreWeave - Kubeconfig File (not implemented)",
  //     desc: "Your [CoreWeave](https://cloud.coreweave.com/) KubeConfig from https://cloud.coreweave.com/tokens/api-access.  This supports managing compute servers on CoreWeave Cloud.",
  //     default: "",
  //     multiline: 5,
  //     password: true,
  //     show: compute_servers_enabled,
  //   },
  google_cloud_service_account_json: {
    name: "Compute Servers: Google Cloud - Service Account Json",
    desc: 'A Google Cloud [Service Account](https://console.cloud.google.com/iam-admin/serviceaccounts) with the following IAM Roles: "Editor" (for compute servers) AND "Project IAM Admin" (for cloud file system).  This supports managing compute servers on Google Cloud, and you must (1) [enable the Compute Engine API](https://console.cloud.google.com/apis/library/compute.googleapis.com) and [the Monitoring API](https://console.cloud.google.com/apis/library/monitoring.googleapis.com) for this Google Cloud project.  This is a multiline json file that looks like\n\n```js\n{"type": "service_account",...,"universe_domain": "googleapis.com"}\n```',
    default: "",
    multiline: 5,
    password: true,
    show: compute_servers_google_enabled,
    tags: ["Compute Servers", "Google Cloud"],
  },
  google_cloud_bigquery_billing_service_account_json: {
    name: "Compute Servers: Google Cloud BigQuery Service Account Json",
    desc: "Another Google Cloud Service Account that has read access to the regularly updated detailed billing data.  You have to [enable *detailed* billing export to BigQuery](https://cloud.google.com/billing/docs/how-to/export-data-bigquery), then provides a service account here that provides: 'BigQuery Data Viewer' and 'BigQuery Job User'.  NOTE: When I setup detailed billing export for cocalc.com it took about 3 days (!) before I started seeing any detailed billing data!",
    default: "",
    multiline: 5,
    password: true,
    show: compute_servers_google_enabled,
    tags: ["Compute Servers", "Google Cloud"],
  },
  google_cloud_bigquery_detailed_billing_table: {
    name: "Compute Servers: Google Cloud Detailed Billing BigQuery Table Name",
    desc: "The name of your BigQuery detailed billing exports table. See remarks about BigQuery Service Account above.  This might look like 'sage-math-inc.detailed_billing.gcp_billing_export_resource_v1_00D083_5513BD_B6E72F'",
    default: "",
    to_val: to_trimmed_str,
    show: compute_servers_google_enabled,
    valid: (x) => !x || x.includes(".detailed_billing."),
    tags: ["Compute Servers", "Google Cloud"],
  },
  google_cloud_compute_servers_prefix: {
    name: "Compute Servers: Google Cloud - Resource Prefix",
    desc: "Prepend this string to all Google cloud resources that are created, e.g., VM names, etc. This is useful if you are using a single Google cloud project for more than just this one cocalc server.  KEEP THIS SHORT!  If the prefix is 'comput', then the compute server with id 17 will be called 'compute-17'.  You very likely want to change this, especially if you have several servers in the same Google cloud project; it must be different between different servers.",
    default: "compute",
    to_val: to_trimmed_str,
    show: compute_servers_google_enabled,
    tags: ["Compute Servers", "Google Cloud"],
    valid: () => true,
  },
  google_cloud_compute_servers_image_prefix: {
    name: "Compute Servers: Google Cloud - Image Prefix",
    desc: "Prepend this string to the Google cloud images that are created.  You should probably leave this as the default, keep it very short, and it's fine to share these between CoCalc servers using the same project.",
    default: "cocalc",
    to_val: to_trimmed_str,
    show: compute_servers_google_enabled,
    tags: ["Compute Servers", "Google Cloud"],
    valid: () => true,
  },

  compute_servers_cloudflare_api_key: {
    name: "Compute Servers: CloudFlare API Token",
    desc: 'A CloudFlare [API Token](https://dash.cloudflare.com/profile/api-tokens) that has the "Edit zone DNS" capability for the domain that you set as "Compute Servers: Domain name" above.  This is used for custom subdomains, i.e., so users can make a compute server and connect to it at https://custom.cocalc.io (say).',
    default: "",
    password: true,
    show: (conf) => to_bool(conf.compute_servers_dns_enabled),
    tags: ["Compute Servers"],
  },
  compute_servers_images_spec_url: {
    name: "Compute Servers: Images Spec URL",
    desc: `The URL of the compute server "images.json" spec file.  By default this is [${DEFAULT_COMPUTE_SERVER_IMAGES_JSON}](here), which is managed by SageMath, Inc.  However, you may replace this with your own json spec file, if you want to manage your own compute server images. Note that [${DEFAULT_COMPUTE_SERVER_IMAGES_JSON}](here) is cached for a long time for better control, use a raw URL to a specific commit.  To clear the internal cache of images.json, open any compute server config, click the Advanced checkbox next to Images, then click "Refresh Images".  Live version: [image.json](api/v2/compute/get-images).`,
    default: DEFAULT_COMPUTE_SERVER_IMAGES_JSON,
    show: compute_servers_enabled,
    tags: ["Compute Servers"],
  },
  //   fluidstack_api_key: {
  //     name: "Compute Servers: FluidStack - API Key (not implemented)",
  //     desc: "Your [FluidStack](https://www.fluidstack.io/) API Key from https://console2.fluidstack.io/.  Be sure to also enter your API token below. This supports managing compute servers on FluidStack Cloud.",
  //     default: "",
  //     show: compute_servers_enabled,
  //     tags: ["Compute Servers"],
  //   },
  //   fluidstack_api_token: {
  //     name: "Compute Servers: FluidStack - API Token (not implemented)",
  //     desc: "Your [FluidStack](https://www.fluidstack.io/) API Token from https://console2.fluidstack.io/, to support creating compute servers.",
  //     default: "",
  //     password: true,
  //     show: compute_servers_enabled,
  //     tags: ["Compute Servers"],
  //   },
  //   amazon_web_services_access_key: {
  //     name: "Compute Servers: Amazon Web Services - IAM Access Key (not implemented)",
  //     desc: "Your AWS API Key from the AWS console.  Be sure to also enter your secret access key below. This supports managing compute servers on Amazon Web Services EC2 Cloud.",
  //     default: "",
  //     password: true,
  //     show: compute_servers_enabled,
  //     tags: ["Compute Servers"],
  //   },
  //   amazon_web_services_secret_access_key: {
  //     name: "Compute Servers: Amazon Web Services - IAM Secret Access Key",
  //     desc: "Your [FluidStack](https://www.fluidstack.io/) API Token from https://console2.fluidstack.io/, to support creating compute servers.",
  //     default: "",
  //     password: true,
  //     show: compute_servers_enabled,
  //     tags: ["Compute Servers"],
  //   },
} as const;
