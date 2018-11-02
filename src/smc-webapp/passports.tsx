import * as React from "react";
import { List } from "immutable"
import * as misc from "smc-util/misc"

const { Icon, Tip } = require("./r_misc");

interface Props {
  strategies?: List<string>;
  get_api_key?: string;
  small_size?: boolean;
  no_heading?: boolean;
  style?: object;
}

const PASSPORT_STYLES = {
  facebook: {
    backgroundColor: "#395996",
    color: "white"
  },
  google: {
    backgroundColor: "#DC4839",
    color: "white"
  },
  twitter: {
    backgroundColor: "#55ACEE",
    color: "white"
  },
  github: {
    backgroundColor: "white",
    color: "black"
  }
};

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

export class Passports extends React.Component<Props> {
  render_strategy(name) {
    let size;
    if (name === "email") {
      return;
    }
    let url = `${window.app_base_url}/auth/${name}`;
    if (this.props.get_api_key) {
      url += `?get_api_key=${this.props.get_api_key}`;
    }
    if (this.props.small_size) {
      size = undefined;
    } else {
      size = "2x";
    }
    const style = misc.copy(PASSPORT_STYLES[name]);
    style.display = "inline-block";
    style.padding = "6px";
    style.borderRadius = "50%";
    style.width = "50px";
    style.height = "50px";
    style.marginRight = "10px";
    style.textAlign = "center";
    const cname = misc.capitalize(name);
    const title = (
      <span>
        <Icon name={name} /> {cname}
      </span>
    );
    return (
      <a href={url} key={name} style={{ fontSize: "28px" }}>
        <Tip
          placement="bottom"
          title={title}
          tip={`Use ${cname} to sign into your CoCalc account instead of an email address and password.`}
        >
          <Icon name={name} style={style} />
        </Tip>
      </a>
    );
  }

  render_heading() {
    if (this.props.no_heading) {
      return;
    }
    return <h3 style={{ marginTop: 0 }}>Connect with</h3>;
  }

  render() {
    let left;
    const strategies =
      (left =
        this.props.strategies != null
          ? this.props.strategies.toJS()
          : undefined) != null
        ? left
        : [];
    return (
      <div style={this.props.style}>
        {this.render_heading()}
        <div>
          {Array.from(strategies).map(name => this.render_strategy(name))}
        </div>
        <hr style={{ marginTop: 10, marginBottom: 10 }} />
      </div>
    );
  }
}