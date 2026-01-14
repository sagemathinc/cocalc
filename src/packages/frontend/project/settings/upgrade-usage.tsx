/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, Typography } from "antd";
import { List } from "immutable";
import { FormattedMessage, useIntl } from "react-intl";

import {
  React,
  Rendered,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  Paragraph,
  Text,
  Title,
} from "@cocalc/frontend/components";
import MembershipBadge from "@cocalc/frontend/account/membership-badge";
import { labels } from "@cocalc/frontend/i18n";
import { GPU, process_gpu_quota } from "@cocalc/util/types/gpu";
import AdminQuotas from "./quota-editor/admin-quotas";
import { RunQuota } from "./run-quota";
import { Project } from "./types";

interface Props {
  project_id: string;
  project: Project;
  gpu?: GPU | false;
  mode: "project" | "flyout";
}

export const UpgradeUsage: React.FC<Props> = React.memo(
  ({
    project_id,
    project,
    gpu,
    mode,
  }: Readonly<Props>) => {
    const intl = useIntl();
    const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
    const account_groups: List<string> =
      useTypedRedux("account", "groups") ?? List<string>();

    const is_commercial: boolean = useTypedRedux("customize", "is_commercial");
    function render_membership_note(): Rendered {
      if (!is_commercial) return;
      return (
        <Typography.Text type="secondary">
          <FormattedMessage
            id="project.settings.upgrade-usage.how_upgrade_info_note"
            defaultMessage={
              "<strong>Note:</strong> You can increase the above limits using a custom workspace host or {membershipButton}."
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
          mode={mode}
        />
      );
    }

    function render_gpu(): Rendered {
      if (gpu == null || gpu === false) return;
      const info = process_gpu_quota(gpu);
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
          {intl.formatMessage(
            {
              id: "project.settings.upgrade-usage.intro",
              defaultMessage: `This table lists {projectLabelLower} quotas, their current usage, and their value/limit.
            Click on a row to show more details about it.
            If the {projectLabelLower} is not running, you see the last known quota values.`,
            },
            { projectLabelLower },
          )}
        </Paragraph>
        {render_run_quota()}
        {render_membership_note()}
        {renderQuotaEditor()}
        {render_gpu()}
      </div>
    );
  },
);
