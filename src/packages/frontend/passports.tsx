/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  PassportStrategyFrontend,
  PRIMARY_SSO,
} from "@cocalc/frontend/account/passport-types";
import { CSS, React, TypedMap } from "@cocalc/frontend/app-framework";
import { Icon, isIconName, Tip } from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { List } from "immutable";
import { join } from "path";

interface Props {
  strategies?: List<TypedMap<PassportStrategyFrontend>>;
  get_api_key?: string;
  no_heading?: boolean;
  style?: object;
  disabled?: boolean;
}

const BASE_ICON_STYLE: CSS = {
  display: "inline-block",
  padding: "10px",
  borderRadius: "50%",
  width: "50px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
  verticalAlign: "middle",
} as const;

const SMALL_ICON_STYLE: CSS = {
  width: "25px",
  height: "25px",
  top: "0",
  padding: "4px",
  fontSize: "15px",
} as const;

const CUSTOM_ICON_STYLE: CSS = {
  ...BASE_ICON_STYLE,
  ...{
    display: "inline-block",
    position: "relative", // unclear why, somehow due to faking these fa-icons
    backgroundSize: "contain",
    padding: "0",
  },
} as const;

const TEXT_ICON_STYLE: CSS = {
  backgroundColor: COLORS.GRAY_D,
  color: "white",
  fontSize: "24px",
  display: "inline-block",
  padding: "6px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
  verticalAlign: "middle",
  borderRadius: "10px",
} as const;

const PASSPORT_ICON_STYLES = {
  facebook: {
    backgroundColor: "#395996",
    color: "white",
  },
  google: {
    backgroundColor: "#DC4839",
    color: "white",
  },
  twitter: {
    backgroundColor: "#55ACEE",
    color: "white",
  },
  github: {
    backgroundColor: "white",
    color: "black",
  },
  sso: {
    backgroundColor: "black",
    color: "white",
  },
} as const;

export function strategy2display(strategy: PassportStrategyFrontend): string {
  return strategy.display ?? capitalize(strategy.name);
}

interface StrategyIconProps {
  strategy: PassportStrategyFrontend;
  small?: boolean;
}

export const PassportStrategyIcon: React.FC<StrategyIconProps> = (
  props: StrategyIconProps
) => {
  const { strategy, small } = props;
  const { name, display, icon } = strategy;
  const small_icon = small ? SMALL_ICON_STYLE : {};
  const icon_style: CSS = {
    ...BASE_ICON_STYLE,
    ...small_icon,
  };
  if (PRIMARY_SSO.indexOf(name as any) >= 0 && isIconName(name)) {
    return (
      <Icon
        name={name}
        style={{ ...icon_style, ...PASSPORT_ICON_STYLES[name] }}
      />
    );
  } else if (name === "sso" && isIconName(icon)) {
    return (
      <Icon
        name={icon}
        style={{ ...icon_style, ...PASSPORT_ICON_STYLES[name] }}
      />
    );
  } else if (icon != null) {
    // icon is an URL
    const style: CSS = {
      ...CUSTOM_ICON_STYLE,
      ...{ backgroundImage: `url("${icon}")` },
      ...small_icon,
    };
    return <div style={style} />;
  } else {
    return <div style={TEXT_ICON_STYLE}>{display}</div>;
  }
};

interface PassportStrategyProps {
  strategy: PassportStrategyFrontend;
  disabled?: boolean;
  get_api_key?: string;
}

export const PassportStrategy: React.FC<PassportStrategyProps> = (props) => {
  const { strategy, disabled = false, get_api_key } = props;
  const { name } = strategy;

  function renderTip(passport_name: string) {
    return (
      <>
        Use {passport_name} to sign into your <SiteName /> account instead of an
        email address and password.
      </>
    );
  }

  function strategyTipTitle(name: string, passport_name: string) {
    return (
      <span>
        {isIconName(name) ? <Icon name={name} /> : undefined} {passport_name}
      </span>
    );
  }

  function strategyStyle(): CSS {
    const style: CSS = { fontSize: "28px" };
    if (disabled) {
      style.opacity = 0.5;
    }
    return style;
  }

  function strategyURL(name: string): string {
    let url = "";
    if (!disabled) {
      if (name === "sso") {
        // this is a next.js page listing all non-public SSO strategies
        url = join(appBasePath + "sso");
      } else {
        url = join(appBasePath, "auth", name);
        if (get_api_key) {
          url += `?get_api_key=${get_api_key}`;
        }
      }
    }
    return url;
  }

  if (name === "email") return null;
  const url = strategyURL(name);
  const passport_name = strategy2display(strategy);
  const title = strategyTipTitle(name, passport_name);
  const style = strategyStyle();
  if (disabled) {
    return (
      <span key={name} style={style}>
        <Tip
          placement="bottom"
          title={title}
          tip={"Please agree to the terms of service first."}
        >
          <PassportStrategyIcon strategy={strategy} />
        </Tip>
      </span>
    );
  } else {
    return (
      <a href={url} key={name} style={style}>
        <Tip placement="bottom" title={title} tip={renderTip(passport_name)}>
          <PassportStrategyIcon strategy={strategy} />
        </Tip>
      </a>
    );
  }
};

export const Passports: React.FC<Props> = (props: Props) => {
  const {
    strategies = List([]),
    get_api_key,
    no_heading,
    style,
    disabled,
  } = props;

  const havePrivateSSO = strategies.some(
    (strategy) => strategy.get("public", true) === false
  );

  function renderHeading() {
    if (no_heading) {
      return;
    }
    const style: CSS = { marginTop: 0 };
    if (disabled) {
      style.opacity = 0.5;
    }
    return <h3 style={style}>Connect with</h3>;
  }

  function renderPublicStrategies() {
    return strategies
      .filter(
        (strategy) =>
          strategy.get("public", true) || strategy.get("do_not_hide", false)
      )
      .map((strategy) => (
        <PassportStrategy
          key={strategy.get("name")}
          disabled={disabled}
          get_api_key={get_api_key}
          strategy={strategy.toJS()}
        />
      ));
  }

  function renderPrivateSSO() {
    if (!havePrivateSSO) return;
    return (
      // "fake" SSO strategy to point to the SSO next.js page
      <PassportStrategy
        disabled={disabled}
        strategy={{
          name: "sso",
          display: "Single-Sign-On",
          icon: "api",
          public: true,
        }}
      />
    );
  }

  return (
    <div style={style}>
      {renderHeading()}
      <div style={{ display: "flex" }}>
        {renderPublicStrategies()}
        {renderPrivateSSO()}
      </div>
    </div>
  );
};
