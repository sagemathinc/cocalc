import { fromJS, Map } from "immutable";
import { Component, React, Rendered, redux } from "../app-framework";
import { SiteLicensePublicInfo as Info } from "./types";
import { site_license_public_info } from "./util";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { alert_message } from "../alerts";
import { Alert, Button, Popconfirm } from "antd";
import { DisplayUpgrades, scale_by_display_factors } from "./admin/upgrades";
import { plural } from "smc-util/misc2";

interface Props {
  license_id: string;
  project_id?: string; // if not given, just provide the public info about the license (nothing about if it is upgrading a specific project or not) -- this is used, e.g., for the course configuration page
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
    if (!this.state.info) return;
    if (!this.state.info.expires) {
      return <span> (no expiration date set)</span>;
    }
    let word: string =
      new Date() >= this.state.info.expires ? "expired" : "will expire";
    return (
      <span>
        {" "}
        ({word} <TimeAgo date={this.state.info.expires} />)
      </span>
    );
  }

  private get_type(): "warning" | "error" | "success" {
    if (this.state.loading || this.state.info != null) {
      if (this.provides_upgrades()) {
        return "success";
      } else {
        return "warning";
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
    // However, if no project_id specified, this license is being used
    // as part of a course config (or something else), so we still show
    // the license id.
    if (this.props.project_id && !redux.getStore("account").get("is_admin"))
      return;
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

  private run_limit(): string {
    if (!this.state.info) return "";
    if (!this.state.info.run_limit) {
      return "to an unlimited number of simultaneous running projects";
    }
    return `to up to ${this.state.info.run_limit} simultaneous running projects`;
  }

  private render_what_license_provides_overall(): Rendered {
    if (!this.state.info) return;
    if (!this.state.info.upgrades) return;
    return (
      <div>
        Provides the following upgrades {this.run_limit()}
        <DisplayUpgrades
          upgrades={scale_by_display_factors(fromJS(this.state.info.upgrades))}
          style={{
            border: "1px solid #ddd",
            padding: "0 15px",
            backgroundColor: "white",
            margin: "5px 15px"
          }}
        />
      </div>
    );
  }

  private restart_project(): void {
    if (!this.props.project_id) return;
    const actions = redux.getActions("projects");
    actions.restart_project(this.props.project_id);
  }

  private render_upgrades(): Rendered {
    if (!this.props.project_id) {
      // component not being used in the context of a specific project.
      return this.render_what_license_provides_overall();
    }
    let run_limit = this.run_limit();
    if (run_limit) {
      run_limit = "This license can be applied " + run_limit;
    }
    if (!this.provides_upgrades()) {
      if (!this.state.info) return;
      return (
        <div>
          Currently providing no upgrades - you probably need to{" "}
          <a onClick={() => this.restart_project()}>restart your project</a>{" "}
          (it's also possible that the license limit has been reached).{" "}
          {run_limit}
        </div>
      );
    }
    if (this.props.upgrades == null) throw Error("make typescript happy");
    return (
      <div>
        Currently providing the following{" "}
        {plural(this.props.upgrades.size, "upgrade")}:
        <DisplayUpgrades
          upgrades={scale_by_display_factors(this.props.upgrades)}
          style={{
            border: "1px solid #ddd",
            padding: "0 15px",
            backgroundColor: "white",
            margin: "5px 15px"
          }}
        />{" "}
        {run_limit}
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

  private async remove_license(): Promise<void> {
    if (!this.props.project_id) return;
    const actions = redux.getActions("projects");
    // newly added licenses
    try {
      await actions.remove_site_license_from_project(
        this.props.project_id,
        this.props.license_id
      );
    } catch (err) {
      alert_message({
        type: "error",
        message: `Unable to add license key -- ${err}`
      });
      return;
    }
  }

  private render_remove_button(): Rendered {
    if (!this.props.project_id) return;
    const extra = this.provides_upgrades() ? (
      <>
        <br />
        The project will no longer get upgraded using this license, and it may
        restart.
      </>
    ) : (
      undefined
    );
    return (
      <Popconfirm
        title={
          <div>
            Are you sure you want to remove this license from the project?
            {extra}
          </div>
        }
        onConfirm={() => this.remove_license()}
        okText={"Yes"}
        cancelText={"Cancel"}
      >
        <Button style={{ float: "right" }}>Remove License...</Button>
      </Popconfirm>
    );
  }

  public render(): Rendered {
    const message = (
      <div>
        {this.render_remove_button()}
        <Icon name="key" /> {this.render_body()}
        <br />
        {this.render_id()}
        {this.render_upgrades()}
      </div>
    );
    return (
      <Alert
        style={{ marginTop: "5px" }}
        message={message}
        type={this.get_type()}
      />
    );
  }
}
