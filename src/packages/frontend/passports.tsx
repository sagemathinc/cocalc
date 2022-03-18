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
  padding: "6px",
  borderRadius: "50%",
  width: "50px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
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
  const small_icon = small ? { width: "25px", height: "25px", top: "0" } : {};
  if (PRIMARY_SSO.indexOf(name as any) >= 0 && isIconName(name)) {
    const icon_style: CSS = {
      ...BASE_ICON_STYLE,
      ...PASSPORT_ICON_STYLES[name],
      ...small_icon,
    };
    return <Icon name={name} style={icon_style} />;
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

export const Passports: React.FC<Props> = (props: Props) => {
  const {
    strategies = List([]),
    get_api_key,
    no_heading,
    style,
    disabled,
  } = props;

  function render_tip(passport_name: string) {
    return (
      <>
        Use {passport_name} to sign into your <SiteName /> account instead of an
        email address and password.
      </>
    );
  }

  function strategy_tip_title(name: string, passport_name: string) {
    return (
      <span>
        {isIconName(name) ? <Icon name={name} /> : undefined} {passport_name}
      </span>
    );
  }

  function strategy_style(): CSS {
    const style: CSS = { fontSize: "28px" };
    if (disabled) {
      style.opacity = 0.5;
    }
    return style;
  }

  function strategy_url(name: string): string {
    let url = "";
    if (!disabled) {
      url = join(appBasePath, "auth", name);
      if (get_api_key) {
        url += `?get_api_key=${props.get_api_key}`;
      }
    }
    return url;
  }

  function render_strategy(strategy: PassportStrategyFrontend) {
    const { name } = strategy;
    if (name === "email") return;
    const url = strategy_url(name);
    const passport_name = strategy2display(strategy);
    const title = strategy_tip_title(name, passport_name);
    const style = strategy_style();
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
          <Tip placement="bottom" title={title} tip={render_tip(passport_name)}>
            <PassportStrategyIcon strategy={strategy} />
          </Tip>
        </a>
      );
    }
  }

  function render_heading() {
    if (no_heading) {
      return;
    }
    const style: CSS = { marginTop: 0 };
    if (disabled) {
      style.opacity = 0.5;
    }
    return <h3 style={style}>Connect with</h3>;
  }

  return (
    <div style={style}>
      {render_heading()}
      <div style={{ display: "flex" }}>
        {strategies.map((strategy) => render_strategy(strategy.toJS()))}
      </div>
    </div>
  );
};
