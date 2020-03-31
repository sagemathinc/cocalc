import * as React from "react";
import { List } from "immutable";
import * as misc from "smc-util/misc";
import { Icon, Tip } from "./r_misc";
import { SiteName } from "./customize";

export interface PassportStrategy {
  name: string;
}

interface Props {
  strategies?: List<PassportStrategy>;
  get_api_key?: string;
  no_heading?: boolean;
  style?: object;
  disabled?: boolean;
}

const BASE_ICON_STYLE: React.CSSProperties = {
  display: "inline-block",
  padding: "6px",
  borderRadius: "50%",
  width: "50px",
  height: "50px",
  marginRight: "10px",
  textAlign: "center",
};

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

  render_strategy(strategy: PassportStrategy) {
    const { name } = strategy;
    if (name === "email") {
      return;
    }
    let url = `${window.app_base_url}/auth/${name}`;
    if (this.props.get_api_key) {
      url += `?get_api_key=${this.props.get_api_key}`;
    }
    const icon_style = Object.assign(
      {},
      BASE_ICON_STYLE,
      PASSPORT_ICON_STYLES[name]
    );
    const passport_name = misc.capitalize(name);
    const title = (
      <span>
        <Icon name={name} /> {passport_name}
      </span>
    );
    const style: any = { fontSize: "28px" };
    if (this.props.disabled) {
      url = "";
      style.opacity = 0.5;
    }
    if (this.props.disabled) {
      return (
        <span key={name} style={style}>
          <Tip
            placement="bottom"
            title={title}
            tip={"Please agree to the terms of service first."}
          >
            <Icon name={name} style={icon_style} />
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
            <Icon name={name} style={icon_style} />
          </Tip>
        </a>
      );
    }
  }

  render_heading() {
    if (this.props.no_heading) {
      return;
    }
    const style: any = { marginTop: 0 };
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
        <div>
          {strategies.map((strategy) => this.render_strategy(strategy))}
        </div>
        <hr style={{ marginTop: 10, marginBottom: 10 }} />
      </div>
    );
  }
}
