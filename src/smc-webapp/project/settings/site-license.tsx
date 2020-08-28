/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: some code here is similar to code in
// src/smc-webapp/course/configuration/upgrades.tsx

import { Map } from "immutable";
import { redux, Component, Rendered, React } from "../../app-framework";
import { Button } from "../../antd-bootstrap";
import { Icon } from "../../r_misc";
import { alert_message } from "../../alerts";
import { SiteLicensePublicInfo } from "../../site-licenses/site-license-public-info";
import { SiteLicenseInput } from "../../site-licenses/input";
import { PurchaseOneLicenseLink } from "../../site-licenses/purchase";

const { ShowSupportLink } = require("../../support");

interface Props {
  project_id: string;
  site_license?: Map<string, Map<string, number>>;
}

interface State {
  show_site_license: boolean;
}

export class SiteLicense extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { show_site_license: false };
  }

  private async set_license(license_id: string): Promise<void> {
    const actions = redux.getActions("projects");
    // newly added licenses
    try {
      await actions.add_site_license_to_project(
        this.props.project_id,
        license_id
      );
    } catch (err) {
      alert_message({
        type: "error",
        message: `Unable to add license key -- ${err}`,
      });
      return;
    }
  }

  private render_site_license_text(): Rendered {
    if (!this.state.show_site_license) return;
    return (
      <div>
        <br />
        Enter a license key below to automatically apply upgrades from that
        license to this project when it is started. Clear the field below to
        stop applying those upgrades. Upgrades from the license are only applied
        when a project is started. Create a <ShowSupportLink /> if you would
        like to purchase a license key.
        <SiteLicenseInput
          exclude={this.props.site_license?.keySeq().toJS()}
          onSave={(license_id) => {
            this.setState({ show_site_license: false });
            this.set_license(license_id);
          }}
          onCancel={() => this.setState({ show_site_license: false })}
        />
        <br />
      </div>
    );
  }

  private render_current_licenses(): Rendered {
    if (!this.props.site_license) return;
    const v: Rendered[] = [];
    for (const [license_id, upgrades] of this.props.site_license) {
      v.push(
        <SiteLicensePublicInfo
          key={license_id}
          license_id={license_id}
          project_id={this.props.project_id}
          upgrades={upgrades}
        />
      );
    }
    return <div>{v}</div>;
  }

  public render(): Rendered {
    return (
      <div>
        <h4>
          <Icon name="key" /> Licenses
        </h4>
        {this.render_current_licenses()}
        <br />
        <Button
          onClick={() => {
            this.setState({
              show_site_license: true,
            });
          }}
          disabled={this.state.show_site_license}
        >
          <Icon name="key" /> Upgrade using a license key...
        </Button>
        {this.render_site_license_text()}
        <br />
        <br />
        <PurchaseOneLicenseLink />
      </div>
    );
  }
}
