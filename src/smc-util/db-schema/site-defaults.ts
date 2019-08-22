// Default settings to customize a given site, typically a private install of SMC.
export const site_settings_conf = {
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
    name: "KuCalc UI ('yes' or 'no')",
    desc:
      "Whether to show UI elements adapted to what the KuCalc backend provides",
    default: "no"
  }, // TODO -- this will *default* to yes when run from kucalc; but site admin can set it either way anywhere for testing.
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
  }
};