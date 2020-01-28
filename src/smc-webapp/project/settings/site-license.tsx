// NOTE: some code here is similar to code in
// src/smc-webapp/course/configuration/upgrades.tsx

import { difference } from "lodash";
import { redux, Component, Rendered, React } from "../../app-framework";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { LICENSE_STYLE } from "../../course/configuration/upgrades";
import { split } from "smc-util/misc2";
import { Icon } from "../../r_misc";
import { alert_message } from "../../alerts";

const { ShowSupportLink } = require("../../support");

interface Props {
  project_id: string;
  site_license_ids: string[];
}

interface State {
  show_site_license?: boolean;
  site_license_ids: string;
}

export class SiteLicense extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      site_license_ids: ""
    };
  }

  private async set_licenses(): Promise<void> {
    const license_ids = split(this.state.site_license_ids);

    const actions = redux.getActions("projects");
    // newly added licenses
    for (const license_id of difference(
      license_ids,
      this.props.site_license_ids
    )) {
      try {
        await actions.add_site_license_to_project(
          this.props.project_id,
          license_id
        );
      } catch (err) {
        alert_message({
          type: "error",
          message: `Unable to add license key -- ${err}`
        });
        return;
      }
    }
    // removed site licenses
    for (const license_id of difference(
      this.props.site_license_ids,
      license_ids
    )) {
      await actions.remove_site_license_from_project(
        this.props.project_id,
        license_id
      );
    }
  }

  private render_site_license_text(): Rendered {
    if (!this.state.show_site_license) return;
    return (
      <div>
        Enter a license key below to automatically apply upgrades from that
        license to this project when it is started. Clear the field below to
        stop applying those upgrades. Upgrades from the license are only applied
        when a project is started. Create a <ShowSupportLink /> if you would
        like to purchase a license key.
        <input
          style={LICENSE_STYLE}
          type="text"
          value={this.state.site_license_ids}
          onChange={e => this.setState({ site_license_ids: e.target.value })}
        />
        <ButtonGroup>
          {" "}
          <Button onClick={() => this.setState({ show_site_license: false })}>
            Cancel
          </Button>
          <Button
            bsStyle="primary"
            onClick={() => {
              this.set_licenses();
              this.setState({ show_site_license: false });
            }}
          >
            Save
          </Button>{" "}
        </ButtonGroup>
        <br />
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div>
        <Button
          onClick={() => {
            this.setState({
              show_site_license: true,
              site_license_ids: this.props.site_license_ids.join("   ")
            });
          }}
          disabled={this.state.show_site_license}
        >
          <Icon name="key" /> Upgrade using a license key...
        </Button>
        {this.render_site_license_text()}
      </div>
    );
  }
}
