import * as React from "react";
import { ProjectsActions } from "smc-webapp/todo-types";
import { QuotaConsole } from "./quota-console";
import { Icon, Loading, UpgradeAdjustor, SettingBox } from "smc-webapp/r_misc";
import { redux } from "smc-webapp/app-framework";
import { URLBox } from "./url-box";
import { Project } from "./types";

const { HelpEmailLink } = require("../../customize");
const { ShowSupportLink } = require("../../support");
const { Row, Col, Button } = require("react-bootstrap");

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
  all_projects_have_been_loaded?: boolean;
  actions: ProjectsActions; // projects actions
}

interface State {
  show_adjustor: boolean;
}

export class UpgradeUsage extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { show_adjustor: false };
  }

  submit_upgrade_quotas = new_quotas => {
    this.props.actions.apply_upgrades_to_project(
      this.props.project_id,
      new_quotas
    );
    this.setState({ show_adjustor: false });
  };

  render_upgrades_button() {
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

  render_upgrade_adjustor() {
    if (!this.props.all_projects_have_been_loaded) {
      // See https://github.com/sagemathinc/cocalc/issues/3802
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
        quota_params={require("smc-util/schema").PROJECT_UPGRADES.params}
        submit_upgrade_quotas={this.submit_upgrade_quotas}
        cancel_upgrading={() => this.setState({ show_adjustor: false })}
        total_project_quotas={this.props.total_project_quotas}
      />
    );
  }

  render() {
    if (!require("./customize").commercial) {
      return undefined;
    }
    return (
      <SettingBox title="Project usage and quotas" icon="dashboard">
        {this.render_upgrades_button()}
        {this.state.show_adjustor ? this.render_upgrade_adjustor() : undefined}
        <QuotaConsole
          project_id={this.props.project_id}
          project_settings={this.props.project.get("settings")}
          project_status={this.props.project.get("status")}
          project_state={this.props.project.getIn(["state", "state"])}
          user_map={this.props.user_map}
          quota_params={require("smc-util/schema").PROJECT_UPGRADES.params}
          account_groups={this.props.account_groups}
          total_project_quotas={this.props.total_project_quotas}
          all_upgrades_to_this_project={this.props.all_upgrades_to_this_project}
        />
        <hr />
        <span style={{ color: "#666" }}>
          If you have any questions about upgrading a project, create a{" "}
          <ShowSupportLink />, or email <HelpEmailLink /> and include the
          following URL:
          <URLBox />
        </span>
      </SettingBox>
    );
  }
}
