import { Map } from "immutable";
import { Component, React, Rendered, redux } from "../app-framework";
import { SiteLicensePublicInfo as Info } from "./types";
import { site_license_public_info } from "./util";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { Alert } from "antd";
import { DisplayUpgrades } from "./admin/upgrades";
import { plural } from "smc-util/misc2";

interface Props {
  license_id: string;
  upgrades?: Map<string, number>;
}

interface State {
  info?: Info;
  loading: boolean;
}

export class SiteLicensePublicInfo extends Component<Props, State> {
  private mounted: boolean = true;

  constructor(props, state) {
    super(props, state);
    this.state = { loading: true };
    this.fetch_info();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  private async fetch_info(): Promise<void> {
    let info = await site_license_public_info(this.props.license_id);
    if (!this.mounted) return;
    this.setState({ info, loading: false });
  }

  private render_expires(): Rendered {
    if (!this.state.info || !this.state.info.expires) return;
    return (
      <span>
        {" "}
        (expires <TimeAgo date={this.state.info.expires} />)
      </span>
    );
  }

  private get_type(): "info" | "error" | "success" {
    if (this.state.loading || this.state.info != null) {
      if (this.provides_upgrades()) {
        return "success";
      } else {
        return "info";
      }
    } else {
      return "error";
    }
  }

  private render_id(): Rendered {
    // dumb minimal security -- only show this for now to admins.
    // Later license managers will see it.   Of course, somebody could
    // sniff their browser traffic and get it so this is just to
    // discourage really trivial blatant misuse.  We will have other
    // layers of security.
    if (!redux.getStore("account").get("is_admin")) return;
    return (
      <div style={{ fontFamily: "monospace" }}>{this.props.license_id}</div>
    );
  }

  private render_license(): Rendered {
    if (!this.state.info) {
      return <span>Invalid license key</span>;
    }
    return (
      <span>
        {this.state.info.title}
        {this.render_expires()}
      </span>
    );
  }

  private provides_upgrades(): boolean {
    return this.props.upgrades != null && this.props.upgrades.size > 0;
  }

  private render_upgrades(): Rendered {
    if (!this.provides_upgrades()) {
      return <div>Currently providing no upgrades</div>;
    }
    if (this.props.upgrades == null) throw Error("make typescript happy");
    return (
      <div>
        Currently providing the following{" "}
        {plural(this.props.upgrades.size, "upgrade")}:
        <DisplayUpgrades
          upgrades={this.props.upgrades}
          style={{
            border: "1px solid lightgrey",
            padding: "0 15px",
            borderRadius: "5px",
            backgroundColor: "white",
            margin: "5px 15px"
          }}
        />
      </div>
    );
  }

  private render_body(): Rendered {
    if (this.state.loading) {
      return <Loading />;
    } else {
      return this.render_license();
    }
  }

  public render(): Rendered {
    const message = (
      <span>
        <Icon name="key" /> {this.render_body()}
        <br />
        {this.render_id()}
        {this.render_upgrades()}
      </span>
    );
    return <Alert message={message} type={this.get_type()} />;
  }
}
