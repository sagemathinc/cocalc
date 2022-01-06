/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: some code here is similar to code in
// src/@cocalc/frontend/course/configuration/upgrades.tsx

import { Map } from "immutable";
import { redux, Rendered, useState } from "../../app-framework";
import { Button } from "../../antd-bootstrap";
import { Icon } from "../../components";
import { alert_message } from "../../alerts";
import { SiteLicensePublicInfo } from "../../site-licenses/site-license-public-info";
import { SiteLicenseInput } from "../../site-licenses/input";
import { PurchaseOneLicenseLink } from "../../site-licenses/purchase";

interface Props {
  project_id: string;
  site_license?: Map<string, Map<string, number>>;
}

export const SiteLicense: React.FC<Props> = (props: Props) => {
  const { project_id, site_license } = props;

  const [show_site_license, set_show_site_license] = useState<boolean>(false);

  async function set_license(license_id: string): Promise<void> {
    const actions = redux.getActions("projects");
    // newly added licenses
    try {
      await actions.add_site_license_to_project(project_id, license_id);
      await actions.restart_project(project_id);
    } catch (err) {
      alert_message({
        type: "error",
        message: `Unable to add license key -- ${err}`,
      });
      return;
    }
  }

  function render_site_license_text(): Rendered {
    if (!show_site_license) return;
    return (
      <div>
        <br />
        Enter a license key below to apply upgrades from that license to this
        project.{" "}
        <strong>
          Warning: this will cause the project to restart and interrupt any
          running computations.
        </strong>{" "}
        If you want to purchase a license, click the "Buy a license…" button
        below.
        <SiteLicenseInput
          exclude={site_license?.keySeq().toJS()}
          onSave={(license_id) => {
            set_show_site_license(false);
            set_license(license_id);
          }}
          onCancel={() => set_show_site_license(false)}
        />
      </div>
    );
  }

  function render_current_licenses(): Rendered {
    if (!site_license) return;
    const v: Rendered[] = [];
    for (const [license_id, upgrades] of site_license) {
      v.push(
        <SiteLicensePublicInfo
          key={license_id}
          license_id={license_id}
          project_id={project_id}
          upgrades={upgrades}
          restartAfterRemove={true}
        />
      );
    }
    return <div>{v}</div>;
  }

  return (
    <div>
      <h4>
        <Icon name="key" /> Licenses
      </h4>
      {render_current_licenses()}
      <br />
      <Button
        onClick={() => set_show_site_license(true)}
        disabled={show_site_license}
      >
        <Icon name="key" /> Upgrade using a license key...
      </Button>
      {render_site_license_text()}
      <br />
      <br />
      <span style={{ fontSize: "13pt" }}>
        <PurchaseOneLicenseLink />
      </span>
    </div>
  );
};
