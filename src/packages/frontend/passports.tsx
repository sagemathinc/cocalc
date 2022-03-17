/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  PassportStrategy,
  PRIMARY_SSO,
} from "@cocalc/frontend/account/passport-types";
import { TypedMap } from "@cocalc/frontend/app-framework";
import { Icon, isIconName, Tip } from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { List } from "immutable";
import { join } from "path";
import React from "react";

interface Props {
  strategies?: List<TypedMap<PassportStrategy>>;
  get_api_key?: string;
  no_heading?: boolean;
  style?: object;
  disabled?: boolean;
}

const BASE_ICON_STYLE: React.CSSProperties = Object.freeze({
  display: "inline-block",
  padding: "6px",
  borderRadius: "50%",
  width: "50px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
});

const CUSTOM_ICON_STYLE = Object.freeze({
  ...BASE_ICON_STYLE,
  ...{
    display: "inline-block",
    position: "relative", // unclear why, somehow due to faking these fa-icons
    backgroundSize: "contain",
    padding: "0",
  },
} as React.CSSProperties);

const TEXT_ICON_STYLE: React.CSSProperties = Object.freeze({
  backgroundColor: COLORS.GRAY_D,
  color: "white",
  fontSize: "24px",
  display: "inline-block",
  padding: "6px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
  borderRadius: "10px",
});

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
};

export function strategy2display(strategy: PassportStrategy): string {
  return strategy.display ?? capitalize(strategy.name);
}

export function PassportStrategyIcon({
  strategy,
  small,
}: {
  strategy: PassportStrategy;
  small?: boolean;
}) {
  const { name, display, icon } = strategy;
  const small_icon = small ? { width: "25px", height: "25px", top: "0" } : {};
  if (PRIMARY_SSO.indexOf(name) >= 0 && isIconName(name)) {
    const icon_style: React.CSSProperties = {
      ...BASE_ICON_STYLE,
      ...PASSPORT_ICON_STYLES[name],
      ...small_icon,
    };
    return <Icon name={name} style={icon_style} />;
  } else if (icon != null) {
    // icon is an URL
    const style: React.CSSProperties = {
      ...CUSTOM_ICON_STYLE,
      ...{ backgroundImage: `url("${icon}")` },
      ...small_icon,
    };
    return <div style={style} />;
  } else {
    return <div style={TEXT_ICON_STYLE}>{display}</div>;
  }
}

export class Passports extends React.Component<Props> {
  static defaultProps = {
    strategies: List([]),
  };

  render_tip(passport_name: string) {
    return (
      <>
        Use {passport_name} to sign into your <SiteName /> account instead of an
        email address and password.
      </>
    );
  }

  private strategy_tip_title(name: string, passport_name: string) {
    return (
      <span>
        {isIconName(name) ? <Icon name={name} /> : undefined} {passport_name}
      </span>
    );
  }

  private strategy_style(): React.CSSProperties {
    const style: React.CSSProperties = { fontSize: "28px" };
    if (this.props.disabled) {
      style.opacity = 0.5;
    }
    return style;
  }

  private strategy_url(name: string): string {
    let url = "";
    if (!this.props.disabled) {
      url = join(appBasePath, "auth", name);
      if (this.props.get_api_key) {
        url += `?get_api_key=${this.props.get_api_key}`;
      }
    }
    return url;
  }

  private render_strategy(strategy: PassportStrategy) {
    const { name } = strategy;
    if (name === "email") return;
    const url = this.strategy_url(name);
    const passport_name = strategy2display(strategy);
    const title = this.strategy_tip_title(name, passport_name);
    const style = this.strategy_style();
    if (this.props.disabled) {
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
          <Tip
            placement="bottom"
            title={title}
            tip={this.render_tip(passport_name)}
          >
            <PassportStrategyIcon strategy={strategy} />
          </Tip>
        </a>
      );
    }
  }

  private render_heading() {
    if (this.props.no_heading) {
      return;
    }
    const style: React.CSSProperties = { marginTop: 0 };
    if (this.props.disabled) {
      style.opacity = 0.5;
    }
    return <h3 style={style}>Connect with</h3>;
  }

  render() {
    // This any gets automatically fixed when upgrading to Typescript 3.1+
    const strategies = (this.props.strategies as any).toJS();
    return (
      <div style={this.props.style}>
        {this.render_heading()}
        <div style={{ display: "flex" }}>
          {strategies.map((strategy) => this.render_strategy(strategy))}
        </div>
      </div>
    );
  }
}
