/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: some code here is similar to code in
// src/@cocalc/frontend/course/configuration/upgrades.tsx

import { Button, Card, Popover } from "antd";
import { alert_message } from "@cocalc/frontend/alerts";
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
import { unreachable } from "@cocalc/util/misc";
import {
  licenseToGroupKey,
  SiteLicenseQuotaSetting,
} from "@cocalc/util/upgrades/quota";
import { isBoostLicense } from "@cocalc/util/upgrades/utils";
import { SiteLicense as SiteLicenseT } from "./types";
import track from "@cocalc/frontend/user-tracking";

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

  const [boostWarning, setBoostWarning] = useState<
    "none" | "no_other" | "incompatible"
  >("none");
  const [show_site_license, set_show_site_license] = useState<boolean>(false);

  function renderBoostWarning() {
    switch (boostWarning) {
      case "none":
        return;
      case "no_other":
        return (
          <Paragraph>
            Warning: this license is <Text strong>a boost license</Text>, which
            is only useful on top of another regular license, which is valid and
            active. It won't provide upgrades on its own.
          </Paragraph>
        );
      case "incompatible":
        return (
          <Paragraph>
            Warning: this license is <Text strong>a boost license</Text>, which
            is only useful on top of another compatible, valid and active
            regular license. It seems like the other licenses are{" "}
            <Text strong>incompatible</Text> with this boost license.
          </Paragraph>
        );
      default:
        unreachable(boostWarning);
    }
  }

  function site_license_onChange(license_id?: string) {
    if (license_id == null) {
      setBoostWarning("none");
    } else {
      // check, if there is any other license with boost===false
      // thosse are "regular" licenses, which are needed for boost licenses to work
      const license = managed_licenses?.get(license_id)?.toJS();
      if (license != null && license.quota != null && isBoostLicense(license)) {
        const boostGroup = licenseToGroupKey(
          license as SiteLicenseQuotaSetting // we check that license.quota is not null above
        );
        // this ignores any other licenses (e.g. disks), which do not have the boost field
        // for those which are regular licenses, we check if they're compatible with the boost license
        let haveRegular = false;
        const haveCompatible = site_license?.some((x) => {
          const otherLicense = x.toJS();
          if (isBoostLicense(otherLicense)) return false;
          haveRegular = true;
          const regularGroup = licenseToGroupKey(otherLicense);
          return regularGroup === boostGroup;
        });
        setBoostWarning(
          haveCompatible ? "none" : haveRegular ? "incompatible" : "no_other"
        );
      } else {
        setBoostWarning("none");
      }
    }
  }

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
        If you want to purchase a license, click the "Buy a license" button
        below, or click "Redeem a voucher" to redeem a voucher.
        <SiteLicenseInput
          exclude={site_license?.keySeq().toJS()}
          onSave={(license_id) => {
            set_show_site_license(false);
            track("apply-license", { project_id, license_id, how: "settings" });
            applyLicense({ project_id, license_id });
          }}
          onCancel={() => set_show_site_license(false)}
          onChange={site_license_onChange}
          extra={renderBoostWarning()}
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
      <span>
        <Icon name="key" /> Licenses
      </span>
    );
  }

  function render_extra(): Rendered {
    return (
      <Popover
        content={LICENSE_INFORMATION}
        trigger={["click"]}
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
          size="large"
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
