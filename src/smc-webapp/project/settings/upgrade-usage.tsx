import * as React from "react";
import { ProjectsActions } from "smc-webapp/todo-types";
import { QuotaConsole } from "./quota-console";
import { Icon, Loading, UpgradeAdjustor, SettingBox } from "smc-webapp/r_misc";
import { redux, rtypes, rclass, Rendered } from "smc-webapp/app-framework";
import { URLBox } from "./url-box";
import { Project } from "./types";
import { HelpEmailLink } from "../../customize";
import { SiteLicense } from "./site-license";

const { ShowSupportLink } = require("../../support");
const { Row, Col, Button } = require("react-bootstrap");
const { PROJECT_UPGRADES } = require("smc-util/schema");

interface Props {
  project_id: string;
  project: Project;
  user_map: object;
  account_groups: string[];
  upgrades_you_can_use?: object;
  upgrades_you_applied_to_all_projects?: object;
  upgrades_you_applied_to_this_project?: object;
  total_project_quotas?: object;
  all_upgrades_to_this_project?: object;
  site_license_upgrades?: object;
  all_projects_have_been_loaded?: boolean;
  actions: ProjectsActions; // projects actions
  site_license_ids: string[];

  // redux props
  is_commercial?: boolean;
  kucalc?: string;
}

interface State {
  show_adjustor: boolean;
}

class UpgradeUsage extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { show_adjustor: false };
  }

  public static reduxProps(): object {
    return {
      customize: {
        is_commercial: rtypes.bool,
        kucalc: rtypes.string
      }
    };
  }

  private submit_upgrade_quotas(new_quotas): void {
    this.props.actions.apply_upgrades_to_project(
      this.props.project_id,
      new_quotas
    );
    this.setState({ show_adjustor: false });
  }

  private render_upgrades_button(): Rendered {
    if (!this.props.is_commercial) return; // never show if not commercial
    return (
      <Row>
        <Col sm={12}>
          <Button
            bsStyle="primary"
            disabled={this.state.show_adjustor}
            onClick={() => this.setState({ show_adjustor: true })}
            style={{ float: "right", marginBottom: "5px" }}
          >
            <Icon name="arrow-circle-up" /> Adjust your upgrade contributions...
          </Button>
        </Col>
      </Row>
    );
  }

  private render_upgrade_adjustor(): Rendered {
    if (!this.props.is_commercial) return; // never show if not commercial
    if (!this.state.show_adjustor) return; // not being displayed since button not clicked
    if (!this.props.all_projects_have_been_loaded) {
      // Have to wait for this to get accurate value right now.
      // Plan to fix: https://github.com/sagemathinc/cocalc/issues/4123
      // Also, see https://github.com/sagemathinc/cocalc/issues/3802
      redux.getActions("projects").load_all_projects();
      return <Loading theme={"medium"} />;
    }
    return (
      <UpgradeAdjustor
        project_id={this.props.project_id}
        upgrades_you_can_use={this.props.upgrades_you_can_use}
        upgrades_you_applied_to_all_projects={
          this.props.upgrades_you_applied_to_all_projects
        }
        upgrades_you_applied_to_this_project={
          this.props.upgrades_you_applied_to_this_project
        }
        quota_params={PROJECT_UPGRADES.params}
        submit_upgrade_quotas={this.submit_upgrade_quotas.bind(this)}
        cancel_upgrading={() => this.setState({ show_adjustor: false })}
        total_project_quotas={this.props.total_project_quotas}
      />
    );
  }

  private render_quota_console(): Rendered {
    // Note -- we always render this, even if is_commercial is false,
    // since we want admins to be able to change the quotas.
    return (
      <QuotaConsole
        project_id={this.props.project_id}
        project_settings={this.props.project.get("settings")}
        project_status={this.props.project.get("status")}
        project_state={this.props.project.getIn(["state", "state"])}
        user_map={this.props.user_map}
        quota_params={PROJECT_UPGRADES.params}
        account_groups={this.props.account_groups}
        total_project_quotas={this.props.total_project_quotas}
        all_upgrades_to_this_project={this.props.all_upgrades_to_this_project}
        kucalc={this.props.kucalc}
        is_commercial={this.props.is_commercial}
        site_license_upgrades={this.props.site_license_upgrades}
      />
    );
  }

  private render_support(): Rendered {
    if (!this.props.is_commercial) return; // don't render if not commercial
    return (
      <span style={{ color: "#666" }}>
        If you have any questions about upgrading a project, create a{" "}
        <ShowSupportLink />, or email <HelpEmailLink /> and include the
        following URL:
        <URLBox />
      </span>
    );
  }

  private render_site_license(): Rendered {
    if (!this.props.is_commercial) return;
    return (
      <SiteLicense
        project_id={this.props.project_id}
        site_license_ids={this.props.site_license_ids}
      />
    );
  }

  public render(): Rendered {
    return (
      <SettingBox title="Project usage and quotas" icon="dashboard">
        {this.render_upgrades_button()}
        {this.render_upgrade_adjustor()}
        {this.render_quota_console()}
        <hr />
        {this.render_site_license()}
        <hr />
        {this.render_support()}
      </SettingBox>
    );
  }
}

const tmp = rclass(UpgradeUsage);
export { tmp as UpgradeUsage };
