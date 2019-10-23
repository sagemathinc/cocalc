/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
CoCalc: Collaborative Calculation in the Cloud
Copyright (C) 2016, Sagemath Inc.
---

Site Customize -- dynamically customize the look of CoCalc for the client.
*/

import { redux, Redux, rclass, rtypes } from "./app-framework";
import * as React from "react";
import { Loading } from "./r_misc";

const schema = require("smc-util/schema");
const misc = require("smc-util/misc");
const theme = require("smc-util/theme");

const test_commercial = (
  c // make it true if starts with y
) => (c[0] != null ? c[0].toLowerCase() : undefined) === "y";

const result: any[] = [];
for (let k in schema.site_settings_conf) {
  const v = schema.site_settings_conf[k];
  result.push([k, v.default]);
}
const defaults = misc.dict(result);
defaults.is_commercial = test_commercial(defaults.commercial);

redux.createStore("customize", defaults);
const actions = redux.createActions("customize");
actions.setState({ is_commercial: true }); // really simple way to have a default value -- gets changed below once the $?.get returns.

// If we are running in the browser, then we customize the schema.  This also gets run on the backend
// to generate static content, which can't be customized.
export let commercial: boolean = defaults.is_commercial;
if (typeof $ !== "undefined" && $ != undefined) {
  $.get((window as any).app_base_url + "/customize", function(obj, status) {
    if (status === "success") {
      obj.commercial =
        obj.commercial != undefined ? obj.commercial : defaults.commercial;
      obj.is_commercial = commercial = test_commercial(obj.commercial);
      actions.setState(obj);
    }
  });
}

interface Props0 {
  text: React.ReactNode;
  color?: string;
}

interface ReduxProps {
  help_email: string;
}

const HelpEmailLink0 = rclass<Props0>(
  class HelpEmailLink extends React.Component<Props0 & ReduxProps> {
    public static reduxProps() {
      return {
        customize: {
          help_email: rtypes.string
        }
      };
    }

    public render() {
      const style: React.CSSProperties = {};
      if (this.props.color != undefined) {
        style.color = this.props.color;
      }

      if (this.props.help_email) {
        return (
          <a
            href={`mailto:${this.props.help_email}`}
            target="_blank"
            style={style}
          >
            {this.props.text != undefined
              ? this.props.text
              : this.props.help_email}
          </a>
        );
      } else {
        return <Loading />;
      }
    }
  }
);

interface HelpEmailLink {
  text?: React.ReactNode;
  color?: string;
}

export function HelpEmailLink(props: HelpEmailLink) {
  return (
    <Redux>
      <HelpEmailLink0 text={props.text} color={props.color} />
    </Redux>
  );
}

interface SiteNameProps {
  site_name: string;
}

const SiteName0 = rclass<{}>(
  class SiteName extends React.Component<SiteNameProps> {
    public static reduxProps() {
      return {
        customize: {
          site_name: rtypes.string
        }
      };
    }

    public render(): JSX.Element {
      if (this.props.site_name) {
        return <span>{this.props.site_name}</span>;
      } else {
        return <Loading />;
      }
    }
  }
);

export function SiteName() {
  return (
    <Redux>
      <SiteName0 />
    </Redux>
  );
}

interface SiteDescriptionProps {
  style: React.CSSProperties;
  site_description: string;
}

const SiteDescription0 = rclass<{ style: React.CSSProperties }>(
  class SiteDescription extends React.Component<SiteDescriptionProps> {
    public static reduxProps() {
      return {
        customize: {
          site_description: rtypes.string
        }
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
        return <Loading />;
      }
    }
  }
);

export function SiteDescription({ style }: { style: React.CSSProperties }) {
  return (
    <Redux>
      <SiteDescription0 style={style} />
    </Redux>
  );
}

// TODO also make this configurable? Needed in the <Footer/> and maybe elsewhere …
export const CompanyName = function CompanyName() {
  return <span>{theme.COMPANY_NAME}</span>;
};

interface ReactProps {
  style: React.CSSProperties;
}

interface ReduxProps {
  terms_of_service: string;
}

const TermsOfService0 = rclass<ReactProps>(
  class TermsOfService extends React.Component<ReactProps & ReduxProps> {
    public static reduxProps = () => {
      return {
        customize: {
          terms_of_service: rtypes.string
        }
      };
    };

    render() {
      if (this.props.terms_of_service == undefined) {
        return <div></div>;
      }
      return (
        <div
          style={this.props.style}
          dangerouslySetInnerHTML={{ __html: this.props.terms_of_service }}
        ></div>
      );
    }
  }
);

export function TermsOfService(props: { style: React.CSSProperties }) {
  return (
    <Redux>
      <TermsOfService0 style={props.style} />
    </Redux>
  );
}

interface AccountCreationEmailInstructionsProps {
  account_creation_email_instructions: string;
}

const AccountCreationEmailInstructions0 = rclass<{}>(
  class AccountCreationEmailInstructions extends React.Component<
    AccountCreationEmailInstructionsProps
  > {
    public static reduxProps = () => {
      return {
        customize: {
          account_creation_email_instructions: rtypes.string
        }
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

export function AccountCreationEmailInstructions() {
  return (
    <Redux>
      <AccountCreationEmailInstructions0 />
    </Redux>
  );
}

// first step of centralizing these URLs in one place → collecting all such pages into one
// react-class with a 'type' prop is the next step (TODO)
// then consolidate this with the existing site-settings database (e.g. TOS above is one fixed HTML string with an anchor)
const app_base_url = (window && (window as any).app_base_url) || ""; // fallback for react-static
export const PolicyIndexPageUrl = app_base_url + "/policies/index.html";
export const PolicyPricingPageUrl = app_base_url + "/policies/pricing.html";
export const PolicyPrivacyPageUrl = app_base_url + "/policies/privacy.html";
export const PolicyCopyrightPageUrl = app_base_url + "/policies/copyright.html";
export const PolicyTOSPageUrl = app_base_url + "/policies/terms.html";
export const SmcWikiUrl = theme.WIKI_URL;
