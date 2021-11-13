/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import { QuotaConsole } from "./quota-console";
import {
  Icon,
  Loading,
  UpgradeAdjustor,
  SettingBox,
} from "@cocalc/frontend/components";
import { redux, Rendered, useTypedRedux } from "@cocalc/frontend/app-framework";
import { URLBox } from "./url-box";
import { Project } from "./types";
import { HelpEmailLink } from "../../customize";
import { SiteLicense } from "./site-license";
import { COLORS } from "@cocalc/util/theme";
import { is_zero_map } from "@cocalc/util/misc";
import {
  DedicatedDisk,
  DedicatedVM,
} from "@cocalc/util/types/dedicated";
import { dedicated_disk_display } from "@cocalc/util/db-schema/site-licenses";
import { PRICES } from "@cocalc/util/consts/dedicated";
import { plural } from "@cocalc/util/misc";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";

const { ShowSupportLink } = require("../../support");
const { Row, Col, Button } = require("react-bootstrap");
const { PROJECT_UPGRADES } = require("@cocalc/util/schema");

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
  dedicated_resources?: {
    vm: false | DedicatedVM;
    disks: DedicatedDisk[];
  };
}

export const UpgradeUsage: React.FC<Props> = React.memo((props: Props) => {
  const {
    project_id,
    project,
    user_map,
    account_groups,
    upgrades_you_can_use,
    upgrades_you_applied_to_all_projects,
    upgrades_you_applied_to_this_project,
    total_project_quotas,
    all_upgrades_to_this_project,
    site_license_upgrades,
    all_projects_have_been_loaded,
    actions,
    //site_license_ids,
    dedicated_resources,
  } = props;

  const is_commercial: boolean = useTypedRedux("customize", "is_commercial");
  const kucalc: string = useTypedRedux("customize", "kucalc");
  const in_kucalc = kucalc !== KUCALC_DISABLED;

  const [show_adjustor, set_show_adjustor] = React.useState<boolean>(false);

  function submit_upgrade_quotas(new_quotas): void {
    actions.apply_upgrades_to_project(project_id, new_quotas);
    set_show_adjustor(false);
  }

  function render_upgrades_button(): Rendered {
    if (!is_commercial) return; // never show if not commercial
    if (dedicated_resources?.vm !== false) return;
    return (
      <Row style={{ borderBottom: "1px solid grey", paddingBottom: "15px" }}>
        <Col sm={12}>
          {is_zero_map(upgrades_you_can_use) ? (
            <div style={{ float: "right" }}>
              Increase these quotas using a license below.
            </div>
          ) : (
            <Button
              bsStyle="primary"
              disabled={show_adjustor}
              onClick={() => set_show_adjustor(true)}
              style={{ float: "right", marginBottom: "5px" }}
            >
              <Icon name="arrow-circle-up" /> Adjust your upgrade
              contributions...
            </Button>
          )}
        </Col>
      </Row>
    );
  }

  function render_upgrade_adjustor(): Rendered {
    if (!is_commercial) return; // never show if not commercial
    if (!show_adjustor) return; // not being displayed since button not clicked
    if (!all_projects_have_been_loaded) {
      // Have to wait for this to get accurate value right now.
      // Plan to fix: https://github.com/sagemathinc/cocalc/issues/4123
      // Also, see https://github.com/sagemathinc/cocalc/issues/3802
      redux.getActions("projects").load_all_projects();
      return <Loading theme={"medium"} />;
    }
    return (
      <UpgradeAdjustor
        upgrades_you_can_use={upgrades_you_can_use}
        upgrades_you_applied_to_all_projects={
          upgrades_you_applied_to_all_projects
        }
        upgrades_you_applied_to_this_project={
          upgrades_you_applied_to_this_project
        }
        quota_params={PROJECT_UPGRADES.params}
        submit_upgrade_quotas={submit_upgrade_quotas}
        cancel_upgrading={() => set_show_adjustor(false)}
        total_project_quotas={total_project_quotas}
      />
    );
  }

  function render_quota_console(): Rendered {
    // Note -- we always render this, even if is_commercial is false,
    // since we want admins to be able to change the quotas.
    // except if this runs on a dedicated VM – where the back-end manages the quotas
    if (dedicated_resources?.vm !== false) {
      return render_dedicated_vm();
    }
    return (
      <QuotaConsole
        project_id={project_id}
        project_settings={project.get("settings")}
        project_status={project.get("status")}
        project_state={project.getIn(["state", "state"])}
        user_map={user_map}
        quota_params={PROJECT_UPGRADES.params}
        account_groups={account_groups}
        total_project_quotas={total_project_quotas}
        all_upgrades_to_this_project={all_upgrades_to_this_project}
        kucalc={kucalc}
        is_commercial={is_commercial}
        site_license_upgrades={site_license_upgrades}
      />
    );
  }

  function render_dedicated_vm(): Rendered {
    if (dedicated_resources == null) return <div>Dedicated VM not defined</div>;
    if (dedicated_resources.vm === false) throw new Error("AssertionError");
    const vm = dedicated_resources.vm;
    const human_readable = PRICES.vms[vm.machine]?.name;
    const name = vm.name;

    return (
      <div>
        <p>This project is configured to run on a dedicated virtual machine.</p>
        <p>
          <strong>
            <code>{vm.machine}</code>
          </strong>
          {human_readable && <span>&nbsp;providing {human_readable}</span>}
          {name && (
            <>
              , <code>id={name}</code>
            </>
          )}
        </p>
      </div>
    );
  }

  function render_dedicated_disks_list(disks): Rendered {
    const entries: Rendered[] = [];
    for (const disk of disks) {
      if (typeof disk === "boolean") continue;
      entries.push(
        <li key={disk.name}>
          {dedicated_disk_display(disk)}
          {disk.name && (
            <>
              , <code>id={disk.name}</code>
            </>
          )}
        </li>
      );
    }
    return <>{entries}</>;
  }

  function render_dedicated_disks(): Rendered {
    if (dedicated_resources == null) return;
    const disks = dedicated_resources.disks;
    if (disks == null) return;
    const num = disks.length;
    if (num === 0) return;
    return (
      <>
        <hr />
        <div>
          <p>Configured dedicated {plural(num, "disk")}:</p>
          <ul>{render_dedicated_disks_list(disks)}</ul>
        </div>
      </>
    );
  }

  function render_support(): Rendered {
    if (!is_commercial) return; // don't render if not commercial
    return (
      <>
        <hr />
        <span style={{ color: COLORS.GRAY }}>
          If you have any questions about upgrading a project, create a{" "}
          <ShowSupportLink />, or email <HelpEmailLink /> and include the
          following URL:
          <URLBox />
        </span>
      </>
    );
  }

  function render_site_license(): Rendered {
    // site licenses are also used in on-prem setups to tweak project quotas
    if (!in_kucalc) return;
    return (
      <>
        <hr />
        <SiteLicense
          project_id={project_id}
          site_license={project.get("site_license") as any}
        />
      </>
    );
  }

  return (
    <SettingBox title="Project usage and quotas" icon="dashboard">
      {render_upgrades_button()}
      {render_upgrade_adjustor()}
      {render_quota_console()}
      {render_dedicated_disks()}
      {render_site_license()}
      {render_support()}
    </SettingBox>
  );
});
