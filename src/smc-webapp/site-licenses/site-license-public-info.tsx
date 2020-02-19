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
  err?: string;
  loading?: boolean;
}

export class SiteLicensePublicInfo extends Component<Props, State> {
  private mounted: boolean = false;

  constructor(props, state) {
    super(props, state);
    this.state = { loading: true };
    this.fetch_info();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  componentWillMount() {
    this.mounted = true;
  }

  private async fetch_info(force: boolean = false): Promise<void> {
    if (this.mounted) {
      this.setState({ loading: true, err: "" });
    }
    try {
      let info = await site_license_public_info(this.props.license_id, force);
      if (!this.mounted) return;
      this.setState({ info, loading: false });
    } catch (err) {
      if (!this.mounted) return;
      this.setState({ err: `${err}`, loading: false });
    }
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
      return;
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

  private render_run_limit(): Rendered {
    if (!this.state.info) return;
    if (!this.state.info.run_limit) {
      return (
        <li>
          This license can be applied to an unlimited number of simultaneous
          running projects.
        </li>
      );
    }
    return (
      <li>
        This license can be applied to up to {this.state.info.run_limit}{" "}
        simultaneous running projects.
      </li>
    );
  }

  private render_running(): Rendered {
    if (!this.state.info) return;
    return (
      <li>
        Currently {this.state.info.running}{" "}
        {this.state.info.running == 1 ? "project is" : "projects are"} using
        this license.
      </li>
    );
  }

  private render_overall_limit(): Rendered {
    if (!this.state.info) return;
    if (!this.state.info.run_limit) {
      return (
        <span>to an unlimited number of simultaneous running projects</span>
      );
    }
    return (
      <span>
        to up to {this.state.info.run_limit} simultaneous running projects
      </span>
    );
  }

  private render_what_license_provides_overall(): Rendered {
    if (!this.state.info) return;
    if (!this.state.info.upgrades) return;
    return (
      <div>
        Provides the following upgrades {this.render_overall_limit()}
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
    let provides: Rendered;
    if (!this.provides_upgrades()) {
      if (!this.state.info) return;
      if (
        !this.state.info.run_limit ||
        this.state.info.running < this.state.info.run_limit
      ) {
        provides = (
          <>
            <li>Currently providing no upgrades to this project. </li>
            <li>
              <Icon name="warning" />{" "}
              <a onClick={() => this.restart_project()}>Restart this project</a>{" "}
              to use the upgrades provided by this license.
            </li>
          </>
        );
      } else {
        provides = (
          <>
            <li>Currently providing no upgrades to this project.</li>
            <li>
              <Icon name="warning" /> This license is already being used to
              upgrade {this.state.info.running} other running projects, which is
              the limit. If possible, stop one of those projects, then{" "}
              <a onClick={() => this.restart_project()}>
                restart this project.
              </a>
            </li>
          </>
        );
      }
    } else {
      if (this.props.upgrades == null) throw Error("make typescript happy");
      provides = (
        <li>
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
          />
        </li>
      );
    }
    return (
      <ul>
        {provides}
        {this.render_run_limit()}
        {this.render_running()}
      </ul>
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

  private render_refresh_button(): Rendered {
    return <Button onClick={() => this.fetch_info(true)}>Refresh</Button>;
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
        <Button>Remove License...</Button>
      </Popconfirm>
    );
  }

  private render_err(): Rendered {
    if (this.state.err) {
      return (
        <div>
          <br />
          {this.state.err}
        </div>
      );
    }
  }

  public render(): Rendered {
    const message = (
      <div>
        <Button.Group style={{ float: "right" }}>
          {this.render_refresh_button()}
          {this.render_remove_button()}
        </Button.Group>
        <Icon name="key" /> {this.render_body()}
        <br />
        {this.render_id()}
        {this.render_upgrades()}
        {this.render_err()}
      </div>
    );
    return (
      <Alert
        style={{ marginTop: "5px", minHeight: "48px" }}
        message={message}
        type={this.get_type()}
      />
    );
  }
}
