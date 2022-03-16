/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: some code here is similar to code in
// src/@cocalc/frontend/course/configuration/upgrades.tsx

import { Card } from "antd";
import { alert_message } from "@cocalc/frontend/alerts";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import { redux, Rendered, useState } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { PurchaseOneLicenseLink } from "@cocalc/frontend/site-licenses/purchase";
import {
  SiteLicensePublicInfoTable,
  SiteLicenses,
} from "@cocalc/frontend/site-licenses/site-license-public-info";
import { Map } from "immutable";

interface Props {
  project_id: string;
  site_license?: Map<string, Map<string, number>>;
}

export async function applyLicense({
  project_id,
  license_id,
}: {
  project_id: string;
  license_id: string;
}): Promise<void> {
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

export const SiteLicense: React.FC<Props> = (props: Props) => {
  const { project_id, site_license } = props;

  const [show_site_license, set_show_site_license] = useState<boolean>(false);

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
            applyLicense({ project_id, license_id });
          }}
          onCancel={() => set_show_site_license(false)}
        />
      </div>
    );
  }

  function render_current_licenses(): Rendered {
    if (!site_license) return;
    const site_licenses: SiteLicenses = site_license.reduce((acc, v, k) => {
      acc[k] = v;
      return acc;
    }, {});
    return (
      <div>
        <SiteLicensePublicInfoTable
          site_licenses={site_licenses}
          project_id={project_id}
          restartAfterRemove={true}
        />
      </div>
    );
  }

  return (
    <Card
      title={
        <h4>
          <Icon name="key" /> Licenses
        </h4>
      }
      type="inner"
      style={{ marginTop: "15px" }}
      bodyStyle={{ padding: "0px" }}
    >
      {render_current_licenses()}
      <br />
      <div style={{ padding: "15px" }}>
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
    </Card>
  );
};
