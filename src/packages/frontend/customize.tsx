/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Site Customize -- dynamically customize the look of CoCalc for the client.

import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import {
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
  KUCALC_ON_PREMISES,
  site_settings_conf,
} from "@cocalc/util/db-schema/site-defaults";
import { dict, YEAR } from "@cocalc/util/misc";
import * as theme from "@cocalc/util/theme";
import { gtag_id } from "@cocalc/util/theme";
import { Quota } from "@cocalc/util/upgrades/quota";
import { List } from "immutable";
import { join } from "path";
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
} from "./app-framework";
import {
  A,
  build_date,
  Loading,
  r_join,
  smc_git_rev,
  smc_version,
  Space,
  UNIT,
} from "./components";
import { appBasePath } from "./customize/app-base-path";
export { TermsOfService } from "./customize/terms-of-service";

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

const result: any[] = [];
for (const k in site_settings_conf) {
  const v = site_settings_conf[k];
  const value: any =
    typeof v.to_val === "function" ? v.to_val(v.default) : v.default;
  result.push([k, value]);
}
const defaults: any = dict(result);
defaults.is_commercial = defaults.commercial;
defaults._is_configured = false; // will be true after set via call to server

// CustomizeState is maybe extension of what's in SiteSettings
// so maybe there is a more clever way like this to do it than
// what I did below.
// type SiteSettings = { [k in keyof SiteSettingsConfig]: any  };

export interface CustomizeState {
  is_commercial: boolean;
  ssh_gateway: boolean;
  account_creation_email_instructions: string;
  commercial: boolean;
  default_quotas: "{}";
  dns: "cocalc.com";
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
  max_upgrades: TypedMap<Quota>;
  nonfree_countries?: List<string>;
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
  _is_configured: boolean;
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
}

export class CustomizeActions extends Actions<CustomizeState> {}

export const store = redux.createStore("customize", CustomizeStore, defaults);
const actions = redux.createActions("customize", CustomizeActions);
// really simple way to have a default value -- gets changed below once the $?.get returns.
actions.setState({ is_commercial: true, ssh_gateway: true });

// If we are running in the browser, then we customize the schema.  This also gets run on the backend
// to generate static content, which can't be customized.
export let commercial: boolean = defaults.is_commercial;

// For now, hopefully not used (this was the old approach).
// in the future we might want to reload the configuration, though.
// Note that this *is* clearly used as a fallback below though...!
async function init_customize() {
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

  const { configuration, registration, strategies } = customize;
  process_customize(configuration);
  const actions = redux.getActions("account");
  // Which account creation strategies we support.
  actions.setState({ strategies });
  // Set whether or not a registration token is required when creating account.
  actions.setState({ token: !!registration });
}

init_customize();

function process_customize(obj) {
  // TODO make this a to_val function in site_settings_conf.kucalc
  obj.kucalc = validate_kucalc(obj.kucalc);
  obj.is_cocalc_com = obj.kucalc == KUCALC_COCALC_COM;

  for (const k in site_settings_conf) {
    const v = site_settings_conf[k];
    obj[k] = obj[k] ?? v.default;
    if (typeof v.to_val === "function") {
      obj[k] = v.to_val(obj[k], obj);
    }
  }
  set_customize(obj);
}

// "obj" are the already processed values from the database
// this function is also used by hub-landing!
export function set_customize(obj) {
  // console.log('set_customize obj=\n', JSON.stringify(obj, null, 2));

  // set some special cases, backwards compatibility
  commercial = obj.is_commercial = obj.commercial;

  obj._is_configured = true;
  actions.setState(obj);
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
  }
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

    public render(): JSX.Element {
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
  }
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
  }
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
  }
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

  function contents() {
    const elements = [
      <A key="name" href={appBasePath}>
        <SiteName /> by {organizationName}
      </A>,
      <A key="status" href={SystemStatusUrl}>
        System Status
      </A>,
      <A key="tos" href={TOSurl}>
        Terms of Service
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
      <Space />
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

async function init_analytics() {
  await store.until_configured();
  if (!store.get("is_commercial")) return;
  // 1. Google analytics
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
  // for commercial setup, enable conversion tracking...
  // the gtag initialization
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", gtag_id);
  // load tagmanager
  const jtag = w.document.createElement("script");
  jtag.src = `https://www.googletagmanager.com/gtag/js?id=${theme.gtag_id}`;
  jtag.async = true;
  w.document.getElementsByTagName("head")[0].appendChild(jtag);

  // 2. CoCalc analytics
  const ctag = w.document.createElement("script");
  ctag.src = join(appBasePath, "analytics.js?fqd=false");
  ctag.async = true;
  ctag.defer = true;
  w.document.getElementsByTagName("head")[0].appendChild(ctag);
}

init_analytics();
