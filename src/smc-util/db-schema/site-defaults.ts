// Default settings to customize a given site, typically a private install of CoCalc.

const { is_valid_email_address } = require("smc-util/misc");

export type ConfigValid = Readonly<string[]> | ((val: string) => boolean);

export type RowType = "header" | "setting";

export type SiteSettingsKeys =
  | "theming"
  | "site_name"
  | "site_description"
  | "terms_of_service"
  | "account_creation_email_instructions"
  | "help_email"
  | "logo_square"
  | "logo_rectangular"
  | "splash_image"
  | "index_info_html"
  | "terms_of_service_url"
  | "organization_name"
  | "organization_email"
  | "organization_url"
  | "commercial"
  | "google_analytics"
  | "kucalc"
  | "dns"
  | "ssh_gateway"
  | "version_min_project"
  | "version_min_browser"
  | "version_recommended_browser"
  | "iframe_comm_hosts"
  | "onprem_quota_heading"
  | "default_quotas"
  | "max_upgrades"
  | "email_enabled"
  | "verify_emails";

export interface Config {
  readonly name: string;
  readonly desc: string;
  // there must be a default value, even if it is just ''
  readonly default: string;
  // list of allowed strings or a validator function
  readonly valid?: ConfigValid;
  readonly password?: boolean;
  readonly show?: (conf: any) => boolean;
  // this optional function derives the actual value of this setting from current value.
  readonly to_val?: (val: string) => boolean | string | number;
  // this optional function derives the visual representation for the admin (fallback: to_val)
  readonly to_display?: (val: string) => string;
  readonly hint?: (val: string) => string; // markdown
  readonly type?: RowType;
  readonly clearable?: boolean; // default false
  readonly multiline?: number;
}

export type SiteSettings = Record<SiteSettingsKeys, Config>;

const fallback = (conf, name: SiteSettingsKeys): string =>
  conf[name] ?? site_settings_conf[name].default;

// little helper fuctions, used in the site settings & site settings extras
export const is_email_enabled = (conf): boolean =>
  to_bool(conf.email_enabled) && conf.email_backend !== "none";
export const only_for_smtp = (conf): boolean =>
  is_email_enabled(conf) && conf.email_backend === "smtp";
export const only_for_sendgrid = (conf): boolean =>
  is_email_enabled(conf) && conf.email_backend === "sendgrid";
export const only_for_password_reset_smtp = (conf): boolean =>
  to_bool(conf.email_enabled) && conf.password_reset_override === "smtp";
export const only_onprem = (conf): boolean =>
  conf.kucalc === KUCALC_ON_PREMISES;
export const only_cocalc_com = (conf): boolean =>
  conf.kucalc === KUCALC_COCALC_COM;
export const not_cocalc_com = (conf): boolean => !only_cocalc_com(conf);
export const show_theming_vars = (conf): boolean =>
  to_bool(fallback(conf, "theming"));
export const only_commercial = (conf): boolean =>
  to_bool(fallback(conf, "commercial"));
export const to_bool = (val): boolean => val === "true" || val === "yes";
export const only_booleans = ["yes", "no"]; // we also understand true and false
export const to_int = (val): number => parseInt(val);
export const only_ints = (val) =>
  ((v) => !isNaN(v) && Number.isFinite(v) && Number.isInteger(val))(
    to_int(val)
  );
export const only_nonneg_int = (val) =>
  ((v) => only_ints(v) && v >= 0)(to_int(val));

export const split_iframe_comm_hosts = (hosts) =>
  hosts.match(/[a-zA-Z0-9.-]+/g) || [];

function num_dns_hosts(val): string {
  return `Found ${split_iframe_comm_hosts(val).length} hosts.`;
}

export const KUCALC_DISABLED = "no";
export const KUCALC_COCALC_COM = "yes";
export const KUCALC_ON_PREMISES = "onprem";
const KUCALC_VALID_VALS = [
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
  KUCALC_DISABLED,
];

const help_email_name = "Help email";
const organization_email_desc = `How to contact your organization (fallback: '${help_email_name}').`;

export const site_settings_conf: SiteSettings = {
  // ========= THEMING ===============
  theming: {
    name: "Show Theming",
    desc: "If 'No', the fields below are hidden, not disabled!",
    default: "yes",
    valid: only_booleans,
    to_val: to_bool,
  },
  site_name: {
    name: "Site name",
    desc: "The heading name of your CoCalc site.",
    default: "Open CoCalc",
    clearable: true,
    show: show_theming_vars,
  },
  site_description: {
    name: "Site description",
    desc: "A tagline describing your site.",
    default: "Collaborative Calculation Online",
    clearable: true,
    show: show_theming_vars,
  },
  terms_of_service_url: {
    name: "Terms of Service URL",
    desc:
      "URL to the page describing ToS, Policies, etc. (leave empty to not require)",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  terms_of_service: {
    name: "ToS information",
    desc:
      "The text displayed for the terms of service link (empty falls back a boilerplate using the URL).",
    default:
      "By creating an account you agree to the <em>Terms of Service</em>.",
    clearable: true,
    show: show_theming_vars,
  },
  account_creation_email_instructions: {
    name: "Account creation",
    desc:
      "Instructions displayed next to the box where a user creates their account using their name and email address.",
    default: "Create an Account",
    clearable: true,
    show: show_theming_vars,
  },
  help_email: {
    name: help_email_name,
    desc: "Email address that user is directed to use for support requests",
    default: "",
    valid: is_valid_email_address,
    clearable: true,
    show: show_theming_vars,
  },
  organization_name: {
    name: "Organization name",
    desc:
      "The name of your organization, e.g. 'Hogwarts School of Witchcraft and Wizardry'.",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  organization_email: {
    name: "Contact email address",
    desc: organization_email_desc,
    default: "",
    clearable: true,
    valid: is_valid_email_address,
    show: show_theming_vars,
  },
  organization_url: {
    name: "Organization website",
    desc: "URL link to your organization",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  logo_square: {
    name: "Logo (square)",
    desc: "URL of a square logo (SVG or PNG, about 200x200 px)",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  logo_rectangular: {
    name: "Logo (rectangular)",
    desc: "URL of a rectangular logo (about 450x75 px, SVG or PNG)",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  splash_image: {
    name: "Index page picture",
    desc: "URL of an image displayed on the index page (about 1200x800 px)",
    default: "",
    clearable: true,
    show: show_theming_vars,
  },
  index_info_html: {
    name: "Index page info",
    desc: "An HTML string displayed on the index page.",
    default: "",
    clearable: true,
    show: show_theming_vars,
    multiline: 5,
  },
  // ============== END THEMING ============
  commercial: {
    name: "Commercial",
    desc:
      "Whether or not to include user interface elements related to for-pay upgrades and features.  Set to 'yes' to include these elements.",
    default: "no",
    valid: only_booleans,
    to_val: to_bool,
  },
  kucalc: {
    name: "KuCalc UI",
    desc: `Configure which UI elements to show in order to match the Kubernetes backend. '${KUCALC_COCALC_COM}' for cocalc.com production site, '${KUCALC_ON_PREMISES}' for on-premises k8s, or '${KUCALC_DISABLED}'`,
    default: KUCALC_DISABLED,
    valid: KUCALC_VALID_VALS,
  },
  dns: {
    name: "Domain name",
    desc: "DNS for your server, e.g. cocalc.universe.edu",
    default: "",
    show: not_cocalc_com,
  },
  google_analytics: {
    name: "Google Analytics",
    desc: `The GA tag, only for the cocalc.com production site`,
    default: "",
    show: only_cocalc_com,
  },
  ssh_gateway: {
    name: "SSH Gateway",
    desc: "Show corresponding UI elements",
    default: "no",
    valid: only_booleans,
    to_val: to_bool,
  },
  version_min_project: {
    name: "Required project version",
    desc:
      "Minimal version required by projects (if project older, will be force restarted).",
    default: "0",
  },
  version_min_browser: {
    name: "Required browser version",
    desc:
      "Minimal version required for browser clients (if older, forced disconnect).",
    default: "0",
    valid: only_nonneg_int,
  },
  version_recommended_browser: {
    name: "Recommended version",
    desc: "Older clients receive an upgrade warning.",
    default: "0",
    valid: only_nonneg_int,
  },
  iframe_comm_hosts: {
    name: "IFrame communication hosts",
    desc:
      "List of allowed DNS names, which are allowed to communicate back and forth with an embedded CoCalc instance. If starting with a dot, also all subdomains. It picks all matching '[a-zA-Z0-9.-]+'",
    default: "",
    to_val: split_iframe_comm_hosts,
    to_display: num_dns_hosts,
  },
  onprem_quota_heading: {
    name: "On-prem Quotas",
    desc: "",
    default: "",
    show: only_onprem,
    type: "header",
  },
  default_quotas: {
    name: "Default Quotas",
    desc:
      "A JSON-formatted default quota for projects. This is only for on-prem setups. The fields actual meaning is defined in hub's quota.ts code",
    default: "{}",
    show: only_onprem,
  },
  max_upgrades: {
    name: "Maximum Quota Upgrades",
    desc:
      "A JSON-formatted upper limit of all quotas. This is only for on-prem setups. The fields are defined in the upgrade spec.",
    default: "{}",
    show: only_onprem,
  },
  email_enabled: {
    name: "Email sending enabled",
    desc:
      "Controls visibility of UI elements and if any emails are sent. This is independent of any particular email configuration!",
    default: "no",
    valid: only_booleans,
    to_val: to_bool,
  },
  verify_emails: {
    name: "Verify email addresses",
    desc:
      "If 'true', email verification tokens are sent out + account settings UI shows it – email sending must be enabled",
    default: "no",
    show: is_email_enabled,
    valid: only_booleans,
    to_val: to_bool,
  },
};
