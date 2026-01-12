/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Typography } from "antd";
import { List } from "immutable";
import { join } from "path";
import { FormattedMessage, useIntl } from "react-intl";

import {
  CSS,
  React,
  Rendered,
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  Paragraph,
  Text,
  Title,
  UpgradeAdjustor,
} from "@cocalc/frontend/components";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import { ROOT } from "@cocalc/util/consts/dedicated";
import { is_zero_map, plural, round2, to_human_list } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import {
  DedicatedDisk,
  DedicatedResources,
} from "@cocalc/util/types/dedicated";
import { process_gpu_quota } from "@cocalc/util/types/gpu";
import { GPU } from "@cocalc/util/types/site-licenses";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { dedicatedDiskDisplay } from "@cocalc/util/upgrades/utils";
import AdminQuotas from "./quota-editor/admin-quotas";
import { RunQuota } from "./run-quota";
import { Project } from "./types";

const UPGRADE_BUTTON_STYLE: CSS = {
  paddingBottom: "15px",
} as const;

interface Props {
  project_id: string;
  project: Project;
  upgrades_you_can_use?: object;
  upgrades_you_applied_to_all_projects?: object;
  upgrades_you_applied_to_this_project?: object;
  total_project_quotas?: object;
  all_projects_have_been_loaded?: boolean;
  dedicated_resources?: DedicatedResources;
  gpu?: GPU;
  mode: "project" | "flyout";
}

export const UpgradeUsage: React.FC<Props> = React.memo(
  ({
    project_id,
    project,
    upgrades_you_can_use,
    upgrades_you_applied_to_all_projects,
    upgrades_you_applied_to_this_project,
    total_project_quotas,
    all_projects_have_been_loaded,
    dedicated_resources,
    mode,
  }: Readonly<Props>) => {
    const intl = useIntl();
    const actions: ProjectsActions = useActions("projects");
    const project_actions = useActions({ project_id });
    const account_groups: List<string> =
      useTypedRedux("account", "groups") ?? List<string>();

    const is_commercial: boolean = useTypedRedux("customize", "is_commercial");

    const [show_adjustor, set_show_adjustor] = React.useState<boolean>(false);

    function submit_upgrade_quotas(new_quotas): void {
      actions.apply_upgrades_to_project(project_id, new_quotas);
      set_show_adjustor(false);
    }

    function list_user_contributions() {
      const info: string[] = [];
      const applied = upgrades_you_applied_to_this_project;
      const noUpgrades =
        "You have not contributed any upgrades to this project.";

      if (applied == null) {
        return noUpgrades;
      }

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
        return noUpgrades;
      }

      return to_human_list(info);
    }

    function render_contributions() {
      // never show if not commercial
      // not being displayed since button not clicked
      const showAdjustor = is_commercial && show_adjustor;
      const style = showAdjustor ? { padding: 0 } : {};
      const adjust = (
        <Button
          disabled={show_adjustor}
          onClick={() => set_show_adjustor(true)}
        >
          <Icon name="arrow-circle-up" /> Adjust...
        </Button>
      );
      return (
        <Card
          title="Your upgrade contributions"
          extra={adjust}
          type="inner"
          styles={{ body: style }}
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
        <div style={{ ...UPGRADE_BUTTON_STYLE, marginTop: "15px" }}>
          {noUpgrades ? (
            <Typography.Text type="secondary">
              <FormattedMessage
                id="project.settings.upgrade-usage.how_upgrade_info_note"
                defaultMessage={
                  "<strong>Note:</strong> You can increase the above limits via memberships or Pay As You Go below:"
                }
                values={{
                  strong: (ch) => (
                    <Typography.Text strong>{ch}</Typography.Text>
                  ),
                }}
              />
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

    function renderQuotaEditor(): Rendered {
      // The whole info is in the "run quota" box,
      // below are upgrade contributions (deprecated), and then the license quota upgrades.
      // Also not shown if project runs on a dedicated VM – where the back-end manages the fixed quotas.
      if (dedicated_resources?.vm !== false) {
        return render_dedicated_vm();
      }
      return (
        <>
          {account_groups.includes("admin") && (
            <AdminQuotas
              project_id={project_id}
              style={{ marginTop: "15px" }}
            />
          )}
        </>
      );
    }

    function render_run_quota(): Rendered {
      return (
        <RunQuota
          project_id={project_id}
          project_state={project.getIn(["state", "state"])}
          project={project}
          dedicated_resources={dedicated_resources}
          mode={mode}
        />
      );
    }

    function render_dedicated_vm(): Rendered {
      if (dedicated_resources == null)
        return <div>Dedicated VM not defined</div>;
      if (dedicated_resources.vm === false) throw new Error("AssertionError");
      const vm = dedicated_resources.vm;
      const human_readable = PRICES.vms[vm.machine]?.title;

      return (
        <Card
          title={
            <>
              <Icon name="dedicated" /> Dedicated virtual machine
            </>
          }
          type="inner"
          style={{ marginTop: "15px" }}
        >
          <p>
            This project is configured to run on a Dedicated VM. The machine
            type is{" "}
            <strong>
              <code>{vm.machine}</code>
            </strong>
            {human_readable && <span>&nbsp;providing {human_readable}</span>}.
          </p>
        </Card>
      );
    }

    function renderOpenDisk(disk: DedicatedDisk): Rendered {
      if (typeof disk === "boolean" || disk.name == null) return; // should never happen
      return (
        <a
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // NOTE: there is usually symlink disks/x → /local/... but we can't rely on it,
            // because the project only creates that symlink if there isn't a file/dir already with that name
            project_actions?.open_directory(
              join(".smc/root/", ROOT, `/${disk.name}/`),
            );
          }}
        >
          {dedicatedDiskDisplay(disk)} <Icon name="external-link" />
        </a>
      );
    }

    function render_dedicated_disks_list(disks: DedicatedDisk[]): Rendered {
      const entries: Rendered[] = [];
      for (const disk of disks) {
        if (typeof disk === "boolean") continue;
        entries.push(<li key={disk.name}>{renderOpenDisk(disk)}</li>);
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
        <Card
          title={
            <>
              <Icon name="save" /> Attached dedicated {plural(num, "disk")}
            </>
          }
          type="inner"
          style={{ marginTop: "15px" }}
          styles={{ body: { padding: "10px 0 0 0" } }}
        >
          <ul>{render_dedicated_disks_list(disks)}</ul>
        </Card>
      );
    }

    function render_gpu(): Rendered {
      if (dedicated_resources == null) return;
      const gpu = dedicated_resources.gpu;
      if (gpu == null || gpu === false) return;
      const info = process_gpu_quota({ gpu });
      const nodes = info.nodeSelector
        ? ` on nodes labeled: ${Object.entries(info.nodeSelector)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ")}`
        : "";
      const taint = info.tolerations
        ? ` with taint: ${info.tolerations
            .map((t) => {
              if ("value" in t) {
                return `${t.key}=${t.value}`;
              } else {
                return `${t.key}`;
              }
            })
            .join(", ")}`
        : "";

      return (
        <Card
          title={
            <>
              <Icon name="gpu" /> GPU
            </>
          }
          type="inner"
          style={{ marginTop: "15px" }}
          styles={{ body: { padding: "10px" } }}
        >
          <Text>
            Requesting {gpu.num} GPU(s){nodes}
            {taint}.
          </Text>
        </Card>
      );
    }

    // This is is just a precaution, since "project" isn't properly typed
    if (project == null) {
      return <Loading theme="medium" transparent />;
    }

    return (
      <div>
        <Title level={4}>
          <FormattedMessage
            id="project.settings.upgrade-usage.header"
            defaultMessage={"Usage and Quotas"}
          />
        </Title>
        <Paragraph
          type="secondary"
          ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
        >
          {intl.formatMessage({
            id: "project.settings.upgrade-usage.intro",
            defaultMessage: `This table lists project quotas, their current usage, and their value/limit.
            Click on a row to show more details about it.
            If the project is not running, you see the last known quota values.`,
          })}
        </Paragraph>
        {render_run_quota()}
        {render_upgrades_button()}
        {renderQuotaEditor()}
        {render_dedicated_disks()}
        {render_gpu()}
      </div>
    );
  },
);
