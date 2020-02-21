// Default settings to customize a given site, typically a private install of CoCalc.

const { is_valid_email_address } = require("smc-util/misc");

export type ConfigValid = Readonly<string[]> | ((val: string) => boolean);

export interface Config {
  readonly name: string;
  readonly desc: string;
  readonly default: string;
  // list of allowed strings or a validator function
  readonly valid?: ConfigValid;
  readonly password?: boolean;
  readonly show?: (conf: any) => boolean;
  // this optional function derives the actual value of this setting from current value.
  readonly to_val?: (val: string) => boolean | string | number;
  readonly hint?: (val: string) => string; // markdown
}

export const is_email_enabled = conf =>
  to_bool(conf.email_enabled) && conf.email_backend !== "none";
export const only_for_smtp = conf =>
  is_email_enabled(conf) && conf.email_backend === "smtp";
export const only_for_sendgrid = conf =>
  is_email_enabled(conf) && conf.email_backend === "sendgrid";
export const only_for_password_reset_smtp = conf =>
  to_bool(conf.email_enabled) && conf.password_reset_override === "smtp";
export const only_onprem = conf => conf.kucalc === KUCALC_ON_PREMISES;
export const to_bool = val => val === "true" || val === "yes";
export const only_booleans = ["yes", "no"]; // we also understand true and false
export const to_int = val => parseInt(val);
export const only_ints = val =>
  (v => !isNaN(v) && Number.isFinite(v) && Number.isInteger(val))(to_int(val));
export const only_nonneg_int = val =>
  (v => only_ints(v) && v >= 0)(to_int(val));

export const split_iframe_comm_hosts = hosts =>
  hosts.match(/[a-zA-Z0-9.-]+/g) || [];

function dns_hosts(val) {
  return `Found ${split_iframe_comm_hosts(val).length} hosts.`;
}

export interface SiteSettings {
  site_name: Config;
  site_description: Config;
  terms_of_service: Config;
  account_creation_email_instructions: Config;
  help_email: Config;
  commercial: Config;
  kucalc: Config;
  ssh_gateway: Config;
  version_min_project: Config;
  version_min_browser: Config;
  version_recommended_browser: Config;
  iframe_comm_hosts: Config;
  default_quotas: Config;
  max_upgrades: Config;
  email_enabled: Config;
  verify_emails: Config;
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
  site_name: {
    name: "Site name",
    desc: "The heading name of your CoCalc site.",
    default: "CoCalc"
  },
  site_description: {
    name: "Site description",
    desc: "The description of your CoCalc site.",
    default: ""
  },
  terms_of_service: {
    name: "Terms of service",
    desc:
      "The text displayed for the terms of service link (make empty to not require).",
    default:
      'Click to agree to our <a target="_blank" href="/policies/terms.html">Terms of Service</a>.'
  },
  account_creation_email_instructions: {
    name: "Account creation",
    desc:
      "Instructions displayed next to the box where a user creates their account using their name and email address.",
    default: "Create an Account"
  },
  help_email: {
    name: "Help email",
    desc: "Email address that user is directed to use for support requests",
    default: "help@cocalc.com",
    valid: is_valid_email_address
  },
  commercial: {
    name: "Commercial ('yes' or 'no')",
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
      "Minimal version *required* by projects (if project older, will be force restarted).",
    default: "0"
  },
  version_min_browser: {
    name: "Required browser version",
    desc:
      "Minimal version *retuired* for browser clients (if older, forced disconnect).",
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
    to_val: dns_hosts
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
