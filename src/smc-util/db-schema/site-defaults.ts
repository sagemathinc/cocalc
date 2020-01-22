// Default settings to customize a given site, typically a private install of CoCalc.

interface Config {
  name: string;
  desc: string;
  default: string;
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
  max_quotas: Config;
}

export const KUCALC_DISABLED = "no";
export const KUCALC_COCALC_COM = "yes";
export const KUCALC_ON_PREMISES = "onprem";

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
    default: "help@cocalc.com"
  },
  commercial: {
    name: "Commercial ('yes' or 'no')",
    desc:
      "Whether or not to include user interface elements related to for-pay upgrades and features.  Set to 'yes' to include these elements.",
    default: "no"
  },
  kucalc: {
    name: "KuCalc UI",
    desc: `Configure which UI elements to show in order to match the Kubernetes backend. '${KUCALC_COCALC_COM}' for cocalc.com production site, '${KUCALC_ON_PREMISES}' for on-premises k8s, or '${KUCALC_DISABLED}'`,
    default: KUCALC_DISABLED
  }, // TODO -- this will *default* to yes when run from kucalc; but site admin can set it either way anywhere for testing.
  ssh_gateway: {
    name: "SSH Gateway",
    desc: "'yes' if an ssh gateway exists to show UI elements; or 'no'",
    default: "no"
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
    default: "0"
  },
  version_recommended_browser: {
    name: "Recommended version",
    desc: "Older clients receive an upgrade warning.",
    default: "0"
  },
  iframe_comm_hosts: {
    name: "IFrame communication hosts",
    desc:
      "List of allowed DNS names, which are allowed to communicate back and forth with an embedded CoCalc instance. If starting with a dot, also all subdomains. It picks all matching '[a-zA-Z0-9.-]+'",
    default: ""
  },
  default_quotas: {
    name: "Default Quotas",
    desc:
      "A JSON-formatted default quota for projects. This is only for on-prem setups. The fields actual meaning is defined in hub's quota.ts code",
    default: "{}"
  },
  max_quotas: {
    name: "Maximum Quotas",
    desc:
      "A JSON-formatted upper limit of all quotas. This is only for on-prem setups. The fields are defined in the upgrade spec.",
    default: "{}"
  }
};
