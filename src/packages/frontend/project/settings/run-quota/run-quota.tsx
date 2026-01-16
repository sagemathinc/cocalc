/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PoweroffOutlined } from "@ant-design/icons";
import { Table, Typography } from "antd";
import { useIntl } from "react-intl";

import { React } from "@cocalc/frontend/app-framework";
import { NoWrap, QuestionMarkText, Tip } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import { Upgrades, upgrade2quota_key } from "@cocalc/util/upgrades/quota";
import { Project } from "../types";
import { renderBoolean } from "./components";
import {
  useCurrentUsage,
  useDisplayedFields,
  useMaxUpgrades,
  useRunQuota,
} from "./hooks";
import {
  QUOTAS_BOOLEAN,
  QuotaData,
  RunQuotaType,
  SHOW_MAX,
  Usage,
  Value,
  booleanValueStr,
} from "./misc";

const { Text } = Typography;
const PARAMS = PROJECT_UPGRADES.params;

const INFINITY_CHAR = "∞";

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
  project: Project;
  mode: "project" | "flyout";
}

export const RunQuota: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
    const { project_id, project_state, mode } = props;
    const isFlyout = mode === "flyout";
    const projectIsRunning = project_state === "running";
    const intl = useIntl();
    const projectLabel = intl.formatMessage(labels.project);
    const projectLabelLower = projectLabel.toLowerCase();
    //const projectStatus = project.get("status");
    const currentUsage = useCurrentUsage({ project_id, shortStr: isFlyout });
    const runQuota = useRunQuota(project_id, null);
    const maxUpgrades = useMaxUpgrades();
    const displayedFields = useDisplayedFields();

    function quotaValue(key: keyof RunQuotaType): Value {
      const val = runQuota[key];
      if (val == null) return "N/A";
      return val;
    }

    function displayedName(name: keyof Upgrades): string {
      if (name === "cores") return "CPU";
      if (name === "memory") return "Memory";
      const conf = PARAMS[name];
      return isFlyout
        ? conf?.display_short ?? conf?.display ?? name
        : conf?.display ?? name;
    }

    const data: QuotaData[] = React.useMemo(() => {
      const ar = !!runQuota.always_running;
      return displayedFields.map((name: keyof Upgrades): QuotaData => {
        const key = upgrade2quota_key(name);
        return {
          key,
          display: displayedName(name),
          desc: PARAMS[name]?.desc ?? "",
          quota: key == "idle_timeout" && ar ? INFINITY_CHAR : quotaValue(key),
          maximum: maxUpgrades?.[name] ?? "N/A",
          usage: currentUsage?.[key],
        };
      });
    }, [runQuota, currentUsage, maxUpgrades, projectIsRunning]);

    function renderExtraMaximum(record: QuotaData): React.JSX.Element | undefined {
      if (SHOW_MAX.includes(record.key)) {
        return (
          <>
            The maximum possible quota is {record.maximum}.
          </>
        );
      }
    }

    function renderExtraExplanation(record: QuotaData): React.JSX.Element {
      const idleTimeoutInfo = (
        <>
          To increase the idle timeout, upgrade your membership or enable the
          "always running" quota.
        </>
      );

      switch (record.key) {
        case "idle_timeout":
          // special case: if we have always running, don't tell the user to increase idle timeout (stupid)
          return record.quota != INFINITY_CHAR ? idleTimeoutInfo : <></>;
        default:
          return <></>;
      }
    }

    function renderQuotaValue(record: QuotaData): string {
      const { key, quota, usage } = record;
      if (QUOTAS_BOOLEAN.includes(key as any)) {
        return `This quota is ${booleanValueStr(quota)}.`;
      } else if (key === "gpu") {
        return usage != null
          ? `There are ${usage.display} GPU(s) requested.`
          : ``;
      } else if (key === "patch") {
        return usage != null
          ? `There are ${usage.display} patch(es) in total.`
          : ``;
      } else {
        const curStr =
          usage != null
            ? `Usage right now is ${usage.display} with a limit of ${quota}`
            : `The limit is ${quota}`;
        return `${curStr}.`;
      }
    }

    function renderExtra(record: QuotaData): React.JSX.Element {
      return (
        <>
          {record.desc} {renderQuotaValue(record)} {renderExtraMaximum(record)}{" "}
          {renderExtraExplanation(record)}
        </>
      );
    }

    function renderUsage(record: QuotaData): React.JSX.Element | undefined {
      if (!projectIsRunning) return;
      // the usage of a boolean quota is always the same as its value
      if (QUOTAS_BOOLEAN.includes(record.key as any)) return;
      if (record.key === "patch") return;
      if (record.key === "gpu") return;
      const usage: Usage = record.usage;
      if (usage == null) return;
      const { element } = usage;
      // wrapped in "Text", because that works better with the table layout
      return <NoWrap>{element}</NoWrap>;
    }

    function renderQuotaLimit(record: QuotaData) {
      const val = record["quota"];

      const style = projectIsRunning ? {} : { color: COLORS.GRAY_L };

      if (record.key === "idle_timeout" && val === "&infin;") {
        return (
          <QuestionMarkText
            tip={`If the ${projectLabelLower} stops or the underlying VM goes into maintenance, the ${projectLabelLower} will automatically restart.`}
          >
            &infin;
          </QuestionMarkText>
        );
      }

      if (typeof val === "boolean") {
        return renderBoolean(val, projectIsRunning);
      } else if (record.key === "idle_timeout") {
        return val;
      } else if (Array.isArray(val)) {
        return val.length;
      } else {
        return (
          <Text strong style={style}>
            <NoWrap>{val}</NoWrap>
          </Text>
        );
      }
    }

    function renderValueColumnTitle(): React.JSX.Element {
      if (projectIsRunning) {
        return (
          <QuestionMarkText
            tip={`Usage limit imposed by the current quota configuration. Change your membership to adjust this limit. ${projectLabel} needs to run in order to see the effective runtime quota.`}
          >
            Limit
          </QuestionMarkText>
        );
      } else {
        return (
          <Tip
            tip={`The ${projectLabelLower} is currently not running. The data is stale from the last run. Start the ${projectLabelLower} to see the effective quotas.`}
          >
            Limit <PoweroffOutlined style={{ color: COLORS.ANTD_RED_WARN }} />
          </Tip>
        );
      }
    }

    function renderQuotas() {
      return (
        <Table<QuotaData>
          dataSource={data}
          size="small"
          pagination={false}
          rowClassName={() => "cursor-pointer"}
          expandable={{
            expandedRowRender: (record) => renderExtra(record),
            expandRowByClick: true,
            expandIcon: isFlyout ? () => <></> : undefined,
          }}
        >
          <Table.Column<QuotaData>
            key="key"
            title={
              <QuestionMarkText tip="Name of the quota. Click on a row to expand details.">
                Name
              </QuestionMarkText>
            }
            render={(text) => <NoWrap>{text}</NoWrap>}
            dataIndex="display"
            width={"30%"}
          />
          <Table.Column<QuotaData>
            key="key"
            title={
              <QuestionMarkText tip="Current setting or active usage.">
                Usage
              </QuestionMarkText>
            }
            dataIndex="key"
            render={(_, record) => renderUsage(record)}
            width={"45%"}
            align={"left"}
          />
          <Table.Column<QuotaData>
            key="key"
            title={renderValueColumnTitle()}
            dataIndex="limit"
            render={(_, record) => renderQuotaLimit(record)}
            width={"25%"}
            align={"right"}
          />
        </Table>
      );
    }

    return <div>{renderQuotas()}</div>;
  },
);
