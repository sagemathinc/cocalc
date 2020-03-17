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
  | "help_email"
  | "logo_square"
  | "logo_rectangular"
  | "splash_image"
  | "index_info_html"
  | "terms_of_service_url"
  | "organization_name"
  | "organization_email"
  | "commercial"
  | "google_analytics"
  | "kucalc"
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
}

export type SiteSettings = Record<SiteSettingsKeys, Config>;

// little helper fuctions, used in the site settings & site settings extras
export const is_email_enabled = conf =>
  to_bool(conf.email_enabled) && conf.email_backend !== "none";
export const only_for_smtp = conf =>
  is_email_enabled(conf) && conf.email_backend === "smtp";
export const only_for_sendgrid = conf =>
  is_email_enabled(conf) && conf.email_backend === "sendgrid";
export const only_for_password_reset_smtp = conf =>
  to_bool(conf.email_enabled) && conf.password_reset_override === "smtp";
export const only_onprem = conf => conf.kucalc === KUCALC_ON_PREMISES;
export const only_cocalc_com = conf => conf.kucalc === KUCALC_COCALC_COM;
export const only_commercial = conf => to_bool(conf.commercial);
export const only_theming = conf => to_bool(conf.theming);
export const to_bool = val => val === "true" || val === "yes";
export const only_booleans = ["yes", "no"]; // we also understand true and false
export const to_int = val => parseInt(val);
export const only_ints = val =>
  (v => !isNaN(v) && Number.isFinite(v) && Number.isInteger(val))(to_int(val));
export const only_nonneg_int = val =>
  (v => only_ints(v) && v >= 0)(to_int(val));

export const split_iframe_comm_hosts = hosts =>
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
  KUCALC_DISABLED
];

export const site_settings_conf: SiteSettings = {
  // ========= THEMING ===============
  theming: {
    name: "Theming",
    desc: "Customize aspects of the index page and UI",
    default: "yes",
    valid: only_booleans,
    to_val: to_bool
  },
  site_name: {
    name: "Site name",
    desc: "The heading name of your CoCalc site.",
    default: "Open CoCalc",
    show: only_theming
  },
  site_description: {
    name: "Site description",
    desc: "A tagline describing your site.",
    default: "Collaborative Calculation Online",
    show: only_theming
  },
  terms_of_service_url: {
    name: "Terms of Service",
    desc: "URL to a page describing ToS, Policies, etc.",
    default: "",
    show: only_theming
  },
  terms_of_service: {
    name: "ToS information",
    desc:
      "The text displayed for the terms of service link (make empty to not require).",
    default:
      "By creating an account you agree to the <em>Terms of Service</em>.",
    show: only_theming
  },
  account_creation_email_instructions: {
    name: "Account creation",
    desc:
      "Instructions displayed next to the box where a user creates their account using their name and email address.",
    default: "Create an Account",
    show: only_theming
  },
  help_email: {
    name: "Help email",
    desc: "Email address that user is directed to use for support requests",
    default: "",
    valid: is_valid_email_address,
    show: only_theming
  },
  organization_name: {
    name: "Organization Name",
    desc:
      "The name of your organization, e.g. 'Hogwarts School of Witchcraft and Wizardry' (defaults to 'Site name')",
    default: "",
    show: only_theming
  },
  organization_email: {
    name: "Contact email address",
    desc: "How to contact your organization (defaults to 'Help email')",
    default: "",
    show: only_theming
  },
  logo_square: {
    name: "Logo (square)",
    desc: "URL of a square PNG or SVG image to display as a logo",
    default: "",
    show: only_theming
  },
  logo_rectangular: {
    name: "Logo (rectangular)",
    desc: "URL of a rectangular logo (about 450x75 px)",
    default: "",
    show: only_theming
  },
  splash_image: {
    name: "Index page picture",
    desc: "URL of an image displayed on the index page (about 1200x800 px)",
    default: "",
    show: only_theming
  },
  index_info_html: {
    name: "Index page info",
    desc: "An HTML string displayed on the index page.",
    default: "",
    show: only_theming
  },
  // ============== END THEMING ============
  commercial: {
    name: "Commercial",
    desc:
      "Whether or not to include user interface elements related to for-pay upgrades and features.  Set to 'yes' to include these elements.",
    default: "no",
    valid: only_booleans,
    to_val: to_bool
  },
  kucalc: {
    name: "KuCalc UI",
    desc: `Configure which UI elements to show in order to match the Kubernetes backend. '${KUCALC_COCALC_COM}' for cocalc.com production site, '${KUCALC_ON_PREMISES}' for on-premises k8s, or '${KUCALC_DISABLED}'`,
    default: KUCALC_DISABLED,
    valid: KUCALC_VALID_VALS
  },
  google_analytics: {
    name: "Google Analytics",
    desc: `The GA tag, only for the cocalc.com production site`,
    default: "",
    show: only_cocalc_com
  },
  ssh_gateway: {
    name: "SSH Gateway",
    desc: "Show corresponding UI elements",
    default: "no",
    valid: only_booleans,
    to_val: to_bool
  },
  version_min_project: {
    name: "Required project version",
    desc:
      "Minimal version required by projects (if project older, will be force restarted).",
    default: "0"
  },
  version_min_browser: {
    name: "Required browser version",
    desc:
      "Minimal version required for browser clients (if older, forced disconnect).",
    default: "0",
    valid: only_nonneg_int
  },
  version_recommended_browser: {
    name: "Recommended version",
    desc: "Older clients receive an upgrade warning.",
    default: "0",
    valid: only_nonneg_int
  },
  iframe_comm_hosts: {
    name: "IFrame communication hosts",
    desc:
      "List of allowed DNS names, which are allowed to communicate back and forth with an embedded CoCalc instance. If starting with a dot, also all subdomains. It picks all matching '[a-zA-Z0-9.-]+'",
    default: "",
    to_val: split_iframe_comm_hosts,
    to_display: num_dns_hosts
  },
  onprem_quota_heading: {
    name: "On-prem Quotas",
    desc: "",
    default: "",
    show: only_onprem,
    type: "header"
  },
  default_quotas: {
    name: "Default Quotas",
    desc:
      "A JSON-formatted default quota for projects. This is only for on-prem setups. The fields actual meaning is defined in hub's quota.ts code",
    default: "{}",
    show: only_onprem
  },
  max_upgrades: {
    name: "Maximum Quota Upgrades",
    desc:
      "A JSON-formatted upper limit of all quotas. This is only for on-prem setups. The fields are defined in the upgrade spec.",
    default: "{}",
    show: only_onprem
  },
  email_enabled: {
    name: "Email sending enabled",
    desc:
      "Controls visibility of UI elements and if any emails are sent. This is independent of any particular email configuration!",
    default: "no",
    valid: only_booleans,
    to_val: to_bool
  },
  verify_emails: {
    name: "Verify email addresses",
    desc:
      "If 'true', email verification tokens are sent out + account settings UI shows it – email sending must be enabled",
    default: "no",
    show: is_email_enabled,
    valid: only_booleans,
    to_val: to_bool
  }
};
