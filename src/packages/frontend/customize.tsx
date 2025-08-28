/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Site Customize -- dynamically customize the look and configuration
// of CoCalc for the client.

import { fromJS, List, Map } from "immutable";
import { join } from "path";
import { useIntl } from "react-intl";
import {
  Actions,
  rclass,
  React,
  redux,
  Redux,
  rtypes,
  Store,
  TypedMap,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  build_date,
  Gap,
  Loading,
  r_join,
  smc_git_rev,
  smc_version,
  UNIT,
} from "@cocalc/frontend/components";
import { getGoogleCloudImages, getImages } from "@cocalc/frontend/compute/api";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels, Locale } from "@cocalc/frontend/i18n";
import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import {
  ComputeImage,
  FALLBACK_ONPREM_ENV,
  FALLBACK_SOFTWARE_ENV,
} from "@cocalc/util/compute-images";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import type {
  GoogleCloudImages,
  Images,
} from "@cocalc/util/db-schema/compute-servers";
import { LLMServicesAvailable } from "@cocalc/util/db-schema/llm-utils";
import {
  Config,
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
  KUCALC_ON_PREMISES,
  site_settings_conf,
} from "@cocalc/util/db-schema/site-defaults";
import { deep_copy, dict, YEAR } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { sanitizeSoftwareEnv } from "@cocalc/util/sanitize-software-envs";
import * as theme from "@cocalc/util/theme";
import { CustomLLMPublic } from "@cocalc/util/types/llm";
import { DefaultQuotaSetting, Upgrades } from "@cocalc/util/upgrades/quota";
export { TermsOfService } from "@cocalc/frontend/customize/terms-of-service";
import { delay } from "awaiting";
import { init as initLite } from "./lite";

// update every 2 minutes.
const UPDATE_INTERVAL = 2 * 60000;

// this sets UI modes for using a kubernetes based back-end
// 'yes' (historic value) equals 'cocalc.com'
function validate_kucalc(k?): string {
  if (k == null) return KUCALC_DISABLED;
  const val = k.trim().toLowerCase();
  if ([KUCALC_DISABLED, KUCALC_COCALC_COM, KUCALC_ON_PREMISES].includes(val)) {
    return val;
  }
  console.warn(`site settings customize: invalid kucalc value ${k}`);
  return KUCALC_DISABLED;
}

// populate all default key/values in the "customize" store
const defaultKeyVals: [string, string | string[]][] = [];
for (const k in site_settings_conf) {
  const v: Config = site_settings_conf[k];
  const value: any =
    typeof v.to_val === "function" ? v.to_val(v.default) : v.default;
  defaultKeyVals.push([k, value]);
}
const defaults: any = dict(defaultKeyVals);
defaults.is_commercial = defaults.commercial;
defaults._is_configured = false; // will be true after set via call to server

// CustomizeState is maybe extension of what's in SiteSettings
// so maybe there is a more clever way like this to do it than
// what I did below.
// type SiteSettings = { [k in keyof SiteSettingsConfig]: any  };

export type SoftwareEnvironments = TypedMap<{
  groups: List<string>;
  default: string;
  environments: Map<string, TypedMap<ComputeImage>>;
}>;

export interface CustomizeState {
  time: number; // this will always get set once customize has loaded.
  is_commercial: boolean;

  openai_enabled: boolean;
  google_vertexai_enabled: boolean;
  mistral_enabled: boolean;
  anthropic_enabled: boolean;
  ollama_enabled: boolean;
  custom_openai_enabled: boolean;
  neural_search_enabled: boolean;
  datastore: boolean;
  ssh_gateway: boolean;
  ssh_gateway_dns: string; // e.g. "ssh.cocalc.com"
  ssh_gateway_fingerprint: string; // e.g. "SHA256:a8284..."
  account_creation_email_instructions: string;
  commercial: boolean;
  default_quotas: TypedMap<DefaultQuotaSetting>;
  dns: string; // e.g. "cocalc.com"
  email_enabled: false;
  email_signup: boolean;
  anonymous_signup: boolean;
  google_analytics: string;
  help_email: string;
  iframe_comm_hosts: string[];
  index_info_html: string;
  is_cocalc_com: boolean;
  is_personal: boolean;
  kucalc: string;
  logo_rectangular: string;
  logo_square: string;
  max_upgrades: TypedMap<Partial<Upgrades>>;

  // Commercialization parameters.
  // Be sure to also update disableCommercializationParameters
  // below if you change these:
  nonfree_countries?: List<string>;
  limit_free_project_uptime: number; // minutes
  require_license_to_create_project?: boolean;
  unlicensed_project_collaborator_limit?: number;
  unlicensed_project_timetravel_limit?: number;

  onprem_quota_heading: string;
  organization_email: string;
  organization_name: string;
  organization_url: string;
  share_server: boolean;
  site_description: string;
  site_name: string;
  splash_image: string;
  terms_of_service: string;
  terms_of_service_url: string;
  theming: boolean;
  verify_emails: false;
  version_min_browser: number;
  version_min_project: number;
  version_recommended_browser: number;
  versions: string;
  // extra setting, injected by the hub, not the DB
  // we expect this to follow "ISO 3166-1 Alpha 2" + K1 (Tor network) + XX (unknown)
  // use a lib like https://github.com/michaelwittig/node-i18n-iso-countries
  country: string;
  // flag to signal data stored in the Store.
  software: SoftwareEnvironments;
  _is_configured: boolean;
  jupyter_api_enabled?: boolean;

  compute_servers_enabled?: boolean;
  ["compute_servers_google-cloud_enabled"]?: boolean;
  compute_servers_lambda_enabled?: boolean;
  compute_servers_dns_enabled?: boolean;
  compute_servers_dns?: string;
  compute_servers_images?: TypedMap<Images> | string | null;
  compute_servers_images_google?: TypedMap<GoogleCloudImages> | string | null;

  llm_markup: number;

  ollama?: TypedMap<{ [key: string]: TypedMap<CustomLLMPublic> }>;
  custom_openai?: TypedMap<{ [key: string]: TypedMap<CustomLLMPublic> }>;
  selectable_llms: List<string>;
  default_llm?: string;
  user_defined_llm: boolean;
  llm_default_quota?: number;

  insecure_test_mode?: boolean;

  i18n?: List<Locale>;

  user_tracking?: string;

  lite?: boolean;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
}

export class CustomizeStore extends Store<CustomizeState> {
  async until_configured(): Promise<void> {
    if (this.get("_is_configured")) return;
    await callback2(this.wait, { until: () => this.get("_is_configured") });
  }

  get_iframe_comm_hosts(): string[] {
    const hosts = this.get("iframe_comm_hosts");
    if (hosts == null) return [];
    return hosts.toJS();
  }

  async getDefaultComputeImage(): Promise<string> {
    await this.until_configured();
    return this.getIn(["software", "default"]) ?? DEFAULT_COMPUTE_IMAGE;
  }

  getEnabledLLMs(): LLMServicesAvailable {
    return {
      openai: this.get("openai_enabled"),
      google: this.get("google_vertexai_enabled"),
      ollama: this.get("ollama_enabled"),
      custom_openai: this.get("custom_openai_enabled"),
      mistralai: this.get("mistral_enabled"),
      anthropic: this.get("anthropic_enabled"),
      user: this.get("user_defined_llm"),
    };
  }
}

export class CustomizeActions extends Actions<CustomizeState> {
  // reload is admin only
  updateComputeServerImages = reuseInFlight(async (reload?) => {
    if (!store.get("compute_servers_enabled")) {
      this.setState({ compute_servers_images: fromJS({}) as any });
      return;
    }
    try {
      this.setState({
        compute_servers_images: fromJS(await getImages(reload)) as any,
      });
    } catch (err) {
      this.setState({ compute_servers_images: `${err}` });
    }
  });

  updateComputeServerImagesGoogle = reuseInFlight(async (reload?) => {
    if (!store.get("compute_servers_google-cloud_enabled")) {
      this.setState({ compute_servers_images_google: fromJS({}) as any });
      return;
    }
    try {
      this.setState({
        compute_servers_images_google: fromJS(
          await getGoogleCloudImages(reload),
        ) as any,
      });
    } catch (err) {
      this.setState({ compute_servers_images_google: `${err}` });
    }
  });

  // this is used for accounts that have legacy upgrades
  disableCommercializationParameters = () => {
    this.setState({
      limit_free_project_uptime: undefined,
      require_license_to_create_project: undefined,
      unlicensed_project_collaborator_limit: undefined,
      unlicensed_project_timetravel_limit: undefined,
    });
  };

  reload = async () => {
    await loadCustomizeState();
  };
}

export const store = redux.createStore("customize", CustomizeStore, defaults);
const actions = redux.createActions("customize", CustomizeActions);
// really simple way to have a default value -- gets changed below once the $?.get returns.
actions.setState({ is_commercial: true, ssh_gateway: true });

// If we are running in the browser, then we customize the schema.  This also gets run on the backend
// to generate static content, which can't be customized.
export let commercial: boolean = defaults.is_commercial;

async function loadCustomizeState() {
  if (typeof process != "undefined") {
    // running in node.js
    return;
  }
  let customize;
  await retry_until_success({
    f: async () => {
      const url = join(appBasePath, "customize");
      try {
        customize = await (await fetch(url)).json();
      } catch (err) {
        const msg = `fetch /customize failed -- retrying - ${err}`;
        console.warn(msg);
        throw new Error(msg);
      }
    },
    start_delay: 2000,
    max_delay: 30000,
  });

  const {
    configuration,
    registration,
    strategies,
    software = null,
    ollama = null, // the derived public information
    custom_openai = null,
  } = customize;
  processLite(configuration);
  process_kucalc(configuration);
  process_software(software, configuration.is_cocalc_com);
  process_customize(configuration); // this sets _is_configured to true
  process_ollama(ollama);
  process_custom_openai(custom_openai);
  const actions = redux.getActions("account");
  // Which account creation strategies we support.
  actions.setState({ strategies });
  // Set whether or not a registration token is required when creating account.
  actions.setState({ token: !!registration });
}

export async function init() {
  while (true) {
    await loadCustomizeState();
    await delay(UPDATE_INTERVAL);
  }
}

function process_ollama(ollama?) {
  if (!ollama) return;
  actions.setState({ ollama: fromJS(ollama) });
}

function process_custom_openai(custom_openai?) {
  if (!custom_openai) return;
  actions.setState({ custom_openai: fromJS(custom_openai) });
}

function process_kucalc(obj) {
  // TODO make this a to_val function in site_settings_conf.kucalc
  obj.kucalc = validate_kucalc(obj.kucalc);
  obj.is_cocalc_com = obj.kucalc == KUCALC_COCALC_COM;
}

function process_customize(obj) {
  const obj_orig = deep_copy(obj);
  for (const k in site_settings_conf) {
    const v = site_settings_conf[k];
    obj[k] =
      obj[k] != null ? obj[k] : (v.to_val?.(v.default, obj_orig) ?? v.default);
  }
  // the llm markup special case
  obj.llm_markup = obj_orig._llm_markup ?? 30;

  // always set time, so other code can know for sure that customize was loaded.
  // it also might be helpful to know when
  obj["time"] = Date.now();
  set_customize(obj);
}

// "obj" are the already processed values from the database
// this function is also used by hub-landing!
function set_customize(obj) {
  // console.log('set_customize obj=\n', JSON.stringify(obj, null, 2));

  // set some special cases, backwards compatibility
  commercial = obj.is_commercial = obj.commercial;

  obj._is_configured = true;
  actions.setState(obj);
}

function process_software(software, is_cocalc_com) {
  const dbg = (...msg) => console.log("sanitizeSoftwareEnv:", ...msg);
  if (software != null) {
    // this checks the data coming in from the "/customize" endpoint.
    // Next step is to convert it to immutable and store it in the customize store.
    software = sanitizeSoftwareEnv({ software, purpose: "webapp" }, dbg);
    actions.setState({ software });
  } else {
    if (is_cocalc_com) {
      actions.setState({ software: fromJS(FALLBACK_SOFTWARE_ENV) as any });
    } else {
      software = sanitizeSoftwareEnv(
        { software: FALLBACK_ONPREM_ENV, purpose: "webapp" },
        dbg,
      );
      actions.setState({ software });
    }
  }
}

interface HelpEmailLink {
  text?: React.ReactNode;
  color?: string;
}

export const HelpEmailLink: React.FC<HelpEmailLink> = React.memo(
  (props: HelpEmailLink) => {
    const { text, color } = props;

    const help_email = useTypedRedux("customize", "help_email");
    const _is_configured = useTypedRedux("customize", "_is_configured");

    const style: React.CSSProperties = {};
    if (color != null) {
      style.color = color;
    }

    if (_is_configured) {
      if (help_email?.length > 0) {
        return (
          <A href={`mailto:${help_email}`} style={style}>
            {text ?? help_email}
          </A>
        );
      } else {
        return (
          <span>
            <em>
              {"["}not configured{"]"}
            </em>
          </span>
        );
      }
    } else {
      return <Loading style={{ display: "inline" }} />;
    }
  },
);

export const SiteName: React.FC = React.memo(() => {
  const site_name = useTypedRedux("customize", "site_name");

  if (site_name != null) {
    return <span>{site_name}</span>;
  } else {
    return <Loading style={{ display: "inline" }} />;
  }
});

interface SiteDescriptionProps {
  style?: React.CSSProperties;
  site_description?: string;
}

const SiteDescription0 = rclass<{ style?: React.CSSProperties }>(
  class SiteDescription extends React.Component<SiteDescriptionProps> {
    public static reduxProps() {
      return {
        customize: {
          site_description: rtypes.string,
        },
      };
    }

    public render(): React.JSX.Element {
      const style =
        this.props.style != undefined
          ? this.props.style
          : { color: "#666", fontSize: "16px" };
      if (this.props.site_description != undefined) {
        return <span style={style}>{this.props.site_description}</span>;
      } else {
        return <Loading style={{ display: "inline" }} />;
      }
    }
  },
);

// TODO: not used?
export function SiteDescription({ style }: { style?: React.CSSProperties }) {
  return (
    <Redux>
      <SiteDescription0 style={style} />
    </Redux>
  );
}

// This generalizes the above in order to pick any selected string value
interface CustomizeStringProps {
  name: string;
}
interface CustomizeStringReduxProps {
  site_name: string;
  site_description: string;
  terms_of_service: string;
  account_creation_email_instructions: string;
  help_email: string;
  logo_square: string;
  logo_rectangular: string;
  splash_image: string;
  index_info_html: string;
  terms_of_service_url: string;
  organization_name: string;
  organization_email: string;
  organization_url: string;
  google_analytics: string;
}

const CustomizeStringElement = rclass<CustomizeStringProps>(
  class CustomizeStringComponent extends React.Component<
    CustomizeStringReduxProps & CustomizeStringProps
  > {
    public static reduxProps = () => {
      return {
        customize: {
          site_name: rtypes.string,
          site_description: rtypes.string,
          terms_of_service: rtypes.string,
          account_creation_email_instructions: rtypes.string,
          help_email: rtypes.string,
          logo_square: rtypes.string,
          logo_rectangular: rtypes.string,
          splash_image: rtypes.string,
          index_info_html: rtypes.string,
          terms_of_service_url: rtypes.string,
          organization_name: rtypes.string,
          organization_email: rtypes.string,
          organization_url: rtypes.string,
          google_analytics: rtypes.string,
        },
      };
    };

    shouldComponentUpdate(next) {
      if (this.props[this.props.name] == null) return true;
      return this.props[this.props.name] != next[this.props.name];
    }

    render() {
      return <span>{this.props[this.props.name]}</span>;
    }
  },
);

// TODO: not used?
export function CustomizeString({ name }: CustomizeStringProps) {
  return (
    <Redux>
      <CustomizeStringElement name={name} />
    </Redux>
  );
}

// TODO also make this configurable? Needed in the <Footer/> and maybe elsewhere …
export const CompanyName = function CompanyName() {
  return <span>{theme.COMPANY_NAME}</span>;
};

interface AccountCreationEmailInstructionsProps {
  account_creation_email_instructions: string;
}

const AccountCreationEmailInstructions0 = rclass<{}>(
  class AccountCreationEmailInstructions extends React.Component<AccountCreationEmailInstructionsProps> {
    public static reduxProps = () => {
      return {
        customize: {
          account_creation_email_instructions: rtypes.string,
        },
      };
    };

    render() {
      return (
        <h3 style={{ marginTop: 0, textAlign: "center" }}>
          {this.props.account_creation_email_instructions}
        </h3>
      );
    }
  },
);

// TODO is this used?
export function AccountCreationEmailInstructions() {
  return (
    <Redux>
      <AccountCreationEmailInstructions0 />
    </Redux>
  );
}

export const Footer: React.FC = React.memo(() => {
  const intl = useIntl();
  const on = useTypedRedux("customize", "organization_name");
  const tos = useTypedRedux("customize", "terms_of_service_url");

  const organizationName = on.length > 0 ? on : theme.COMPANY_NAME;
  const TOSurl = tos.length > 0 ? tos : PolicyTOSPageUrl;
  const webappVersionInfo =
    `Version ${smc_version} @ ${build_date}` + ` | ${smc_git_rev.slice(0, 8)}`;
  const style: React.CSSProperties = {
    color: "gray",
    textAlign: "center",
    paddingBottom: `${UNIT}px`,
  };

  const systemStatus = intl.formatMessage({
    id: "customize.footer.system-status",
    defaultMessage: "System Status",
  });

  const name = intl.formatMessage(
    {
      id: "customize.footer.name",
      defaultMessage: "{name} by {organizationName}",
    },
    {
      name: <SiteName />,
      organizationName,
    },
  );

  function contents() {
    const elements = [
      <A key="name" href={appBasePath}>
        {name}
      </A>,
      <A key="status" href={SystemStatusUrl}>
        {systemStatus}
      </A>,
      <A key="tos" href={TOSurl}>
        {intl.formatMessage(labels.terms_of_service)}
      </A>,
      <HelpEmailLink key="help" />,
      <span key="year" title={webappVersionInfo}>
        &copy; {YEAR}
      </span>,
    ];
    return r_join(elements, <> &middot; </>);
  }

  return (
    <footer style={style}>
      <hr />
      <Gap />
      {contents()}
    </footer>
  );
});

// first step of centralizing these URLs in one place → collecting all such pages into one
// react-class with a 'type' prop is the next step (TODO)
// then consolidate this with the existing site-settings database (e.g. TOS above is one fixed HTML string with an anchor)

export const PolicyIndexPageUrl = join(appBasePath, "policies");
export const PolicyPricingPageUrl = join(appBasePath, "pricing");
export const PolicyPrivacyPageUrl = join(appBasePath, "policies/privacy");
export const PolicyCopyrightPageUrl = join(appBasePath, "policies/copyright");
export const PolicyTOSPageUrl = join(appBasePath, "policies/terms");
export const SystemStatusUrl = join(appBasePath, "info/status");
export const PAYGODocsUrl = "https://doc.cocalc.com/paygo.html";

// 1. Google analytics
async function setup_google_analytics(w) {
  // init_analytics already makes sure store is configured
  const ga4 = store.get("google_analytics");
  if (!ga4) return;

  // for commercial setup, enable conversion tracking...
  // the gtag initialization
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", `"${ga4}"`);
  // load tagmanager
  const gtag = w.document.createElement("script");
  gtag.src = `https://www.googletagmanager.com/gtag/js?id=${ga4}`;
  gtag.async = true;
  gtag.defer = true;
  w.document.getElementsByTagName("head")[0].appendChild(gtag);
}

// 2. CoCalc analytics
function setup_cocalc_analytics(w) {
  // init_analytics already makes sure store is configured
  const ctag = w.document.createElement("script");
  ctag.src = join(appBasePath, "analytics.js?fqd=false");
  ctag.async = true;
  ctag.defer = true;
  w.document.getElementsByTagName("head")[0].appendChild(ctag);
}

async function init_analytics() {
  await store.until_configured();
  if (!store.get("is_commercial")) return;

  let w: any;
  try {
    w = window;
  } catch (_err) {
    // Make it so this code can be run on the backend...
    return;
  }
  if (w?.document == null) {
    // Double check that this code can be run on the backend (not in a browser).
    // see https://github.com/sagemathinc/cocalc-landing/issues/2
    return;
  }

  await setup_google_analytics(w);
  await setup_cocalc_analytics(w);
}

init_analytics();

let liteInitialized = false;
function processLite(configuration) {
  if (!configuration.lite || liteInitialized) {
    return;
  }
  liteInitialized = true;
  initLite(redux, configuration);
}
