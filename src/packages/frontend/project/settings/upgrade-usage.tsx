/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  redux,
  Rendered,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  SettingBox,
  UpgradeAdjustor,
} from "@cocalc/frontend/components";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { ShowSupportLink } from "@cocalc/frontend/support";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { is_zero_map, plural, round2, to_human_list } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import {
  DedicatedDisk,
  DedicatedVM,
  dedicated_disk_display,
} from "@cocalc/util/types/dedicated";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { Button, Card, Typography } from "antd";
import { QuotaConsole } from "./quota-console";
import { RunQuota } from "./run-quota";
import { SiteLicense } from "./site-license";
import { Project } from "./types";
import { URLBox } from "./url-box";

const UPGRADE_BUTTON_STYLE: CSS = {
  paddingBottom: "15px",
};
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

  function list_user_contributions() {
    const info: string[] = [];
    const applied = upgrades_you_applied_to_this_project;

    const getAmount = ({ val, param, factor }) => {
      if (typeof val === "boolean") {
        return val ? "1" : "0";
      } else {
        const amount = round2((val ?? 0) * factor);
        const unit = param.display_unit
          ? plural(amount, param.display_unit)
          : "";
        return `${amount} ${unit}`;
      }
    };

    for (const name in PROJECT_UPGRADES.params) {
      const param = PROJECT_UPGRADES.params[name];
      const factor = param.display_factor;
      const val = applied[name];
      // we only show those values, where the user actually contributed something
      if (val == null || val === false || val === 0) continue;
      const display = param.display;
      const amount = getAmount({ val, param, factor });
      info.push(`${display}: ${amount}`);
    }

    if (info.length === 0) {
      return "You have not contributed any upgrades to this project.";
    }

    return to_human_list(info);
  }

  function render_contributions() {
    // never show if not commercial
    // not being displayed since button not clicked
    const showAdjustor = is_commercial && show_adjustor;
    const style = showAdjustor ? { padding: 0 } : {};
    const adjust = (
      <Button disabled={show_adjustor} onClick={() => set_show_adjustor(true)}>
        <Icon name="arrow-circle-up" /> Adjust...
      </Button>
    );
    return (
      <Card
        title="Your upgrade contributions"
        extra={adjust}
        type="inner"
        bodyStyle={style}
      >
        {showAdjustor ? render_upgrade_adjustor() : list_user_contributions()}
      </Card>
    );
  }

  function render_upgrades_button(): Rendered {
    if (!is_commercial) return; // never show if not commercial
    // dedicated VMs have fixed quotas, hence there is nothing to adjust
    if (dedicated_resources?.vm !== false) return;
    const noUpgrades = is_zero_map(upgrades_you_can_use);
    return (
      <div style={UPGRADE_BUTTON_STYLE}>
        {noUpgrades ? (
          <Typography.Text type="secondary">
            <Typography.Text strong>Note:</Typography.Text> You can increase
            these quotas by adding a license below.
          </Typography.Text>
        ) : (
          <>{render_contributions()}</>
        )}
      </div>
    );
  }

  function render_upgrade_adjustor(): Rendered {
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
    // Since 2022-03, we only render this for admins – the whole info is in the "run quota" box,
    // below are upgrade contributions (deprecated), and then the license quota upgrades.
    // Not showsn if this runs on a dedicated VM – where the back-end manages the fixed quotas.
    if (dedicated_resources?.vm !== false) {
      return render_dedicated_vm();
    }
    if (!account_groups.includes("admin")) return;
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
        expand_admin_only={true}
      />
    );
  }

  function render_run_quota(): Rendered {
    return (
      <RunQuota
        project_id={project_id}
        project_state={project.getIn(["state", "state"])}
        project={project}
      />
    );
  }

  function render_dedicated_vm(): Rendered {
    if (dedicated_resources == null) return <div>Dedicated VM not defined</div>;
    if (dedicated_resources.vm === false) throw new Error("AssertionError");
    const vm = dedicated_resources.vm;
    const human_readable = PRICES.vms[vm.machine]?.title;
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
      <SiteLicense
        project_id={project_id}
        site_license={project.get("site_license") as any}
      />
    );
  }

  return (
    <SettingBox
      title="Project usage and quotas"
      icon="dashboard"
      bodyStyle={{ padding: 0 }}
    >
      {render_run_quota()}
      <div style={{ padding: "16px" }}>
        {render_upgrades_button()}
        {render_quota_console()}
        {render_dedicated_disks()}
        {render_site_license()}
        {render_support()}
      </div>
    </SettingBox>
  );
});
