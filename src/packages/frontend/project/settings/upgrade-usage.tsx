/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, Typography } from "antd";
import { List } from "immutable";
import { join } from "path";
import { FormattedMessage, useIntl } from "react-intl";

import {
  React,
  Rendered,
  useTypedRedux,
  useActions,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  Paragraph,
  Text,
  Title,
} from "@cocalc/frontend/components";
import MembershipBadge from "@cocalc/frontend/account/membership-badge";
import { ROOT } from "@cocalc/util/consts/dedicated";
import { plural } from "@cocalc/util/misc";
import {
  DedicatedDisk,
  DedicatedResources,
} from "@cocalc/util/types/dedicated";
import { process_gpu_quota } from "@cocalc/util/types/gpu";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { dedicatedDiskDisplay } from "@cocalc/util/upgrades/utils";
import AdminQuotas from "./quota-editor/admin-quotas";
import { RunQuota } from "./run-quota";
import { Project } from "./types";

interface Props {
  project_id: string;
  project: Project;
  dedicated_resources?: DedicatedResources;
  mode: "project" | "flyout";
}

export const UpgradeUsage: React.FC<Props> = React.memo(
  ({
    project_id,
    project,
    dedicated_resources,
    mode,
  }: Readonly<Props>) => {
    const intl = useIntl();
    const project_actions = useActions({ project_id });
    const account_groups: List<string> =
      useTypedRedux("account", "groups") ?? List<string>();

    const is_commercial: boolean = useTypedRedux("customize", "is_commercial");
    function render_membership_note(): Rendered {
      if (!is_commercial) return;
      if (dedicated_resources?.vm !== false) return;
      return (
        <Typography.Text type="secondary">
          <FormattedMessage
            id="project.settings.upgrade-usage.how_upgrade_info_note"
            defaultMessage={
              "<strong>Note:</strong> You can increase the above limits using a custom project host or {membershipButton}."
            }
            values={{
              strong: (ch) => <Typography.Text strong>{ch}</Typography.Text>,
              membershipButton: <MembershipBadge />,
            }}
          />
        </Typography.Text>
      );
    }

    function renderQuotaEditor(): Rendered {
      // The whole info is in the "run quota" box, below are the license quota upgrades.
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
        {render_membership_note()}
        {renderQuotaEditor()}
        {render_dedicated_disks()}
        {render_gpu()}
      </div>
    );
  },
);
