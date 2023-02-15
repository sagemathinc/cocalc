/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: some code here is similar to code in
// src/@cocalc/frontend/course/configuration/upgrades.tsx

import { Card, Popover } from "antd";

import { alert_message } from "@cocalc/frontend/alerts";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  redux,
  Rendered,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, Text } from "@cocalc/frontend/components";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import { LICENSE_INFORMATION } from "@cocalc/frontend/site-licenses/rules";
import { SiteLicensePublicInfoTable } from "@cocalc/frontend/site-licenses/site-license-public-info";
import { SiteLicenses } from "@cocalc/frontend/site-licenses/types";
import { SiteLicense as SiteLicenseT } from "./types";

interface Props {
  project_id: string;
  site_license?: SiteLicenseT; // of that project!
}

interface ALOpts {
  project_id: string;
  license_id: string;
}

export async function applyLicense(opts: ALOpts): Promise<void> {
  const { project_id, license_id } = opts;
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

  // all licenses known to the client, not just for the project
  const managed_licenses = useTypedRedux("billing", "managed_licenses");

  const [boostWarning, setBoostWarning] = useState<boolean>(false);
  const [show_site_license, set_show_site_license] = useState<boolean>(false);

  function render_site_license_text(): Rendered {
    if (!show_site_license) return;
    return (
      <Paragraph style={{ marginTop: "20px" }}>
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
          onChange={(license_id) => {
            if (license_id == null) {
              setBoostWarning(false);
            } else {
              const license = managed_licenses?.get(license_id)?.toJS();
              const isBoost = license?.quota?.boost === true;
              // this ignores other licenses, which do not have the boost field
              const noRegular = !site_license?.some(
                (x) => x.get("quota")?.get("boost") === false
              );
              // check if there is any other license with boost===false
              setBoostWarning(isBoost && noRegular);
            }
          }}
          extra={
            boostWarning ? (
              <Paragraph>
                Warning: this license is <Text strong>a boost license</Text>,
                which is only useful on top of another regular license, which is
                valid and active. It won't provide upgrades on its own.
              </Paragraph>
            ) : undefined
          }
        />
      </Paragraph>
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

  function render_title(): Rendered {
    return (
      <h4>
        <Icon name="key" /> Licenses
      </h4>
    );
  }

  function render_extra(): Rendered {
    return (
      <Popover
        content={LICENSE_INFORMATION}
        trigger={["click", "hover"]}
        placement="rightTop"
        title="License information"
      >
        <Icon name="question-circle" />
      </Popover>
    );
  }

  return (
    <Card
      title={render_title()}
      extra={render_extra()}
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
          <BuyLicenseForProject project_id={project_id} />
        </span>
      </div>
    </Card>
  );
};
