import { Map } from "immutable";
import { Component, React, Rendered } from "../app-framework";
import { SiteLicensePublicInfo as Info } from "./types";
import { site_license_public_info } from "./util";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { Alert } from "antd";

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
        (expires: <TimeAgo date={this.state.info.expires} />)
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
    return (
      <span style={{ fontFamily: "monospace" }}>{this.props.license_id}</span>
    );
  }

  private render_license(): Rendered {
    if (!this.state.info) {
      return <span>Invalid license key: </span>;
    }
    return (
      <span>
        {this.state.info.title}
        {this.render_expires()}:{" "}
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
        Currently providing these upgrades:{" "}
        {JSON.stringify(this.props.upgrades.toJS())}
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
        <br />
        {this.render_upgrades()}
      </span>
    );
    return <Alert message={message} type={this.get_type()} />;
  }
}
