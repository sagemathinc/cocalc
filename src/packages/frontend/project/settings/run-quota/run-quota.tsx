/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PoweroffOutlined } from "@ant-design/icons";
import { Table, Typography } from "antd";

import { React, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, NoWrap, QuestionMarkText, Tip } from "@cocalc/frontend/components";
import { DOC_CLOUD_STORAGE_URL } from "@cocalc/util/consts/project";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
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
    //const projectStatus = project.get("status");
    const currentUsage = useCurrentUsage({ project_id, shortStr: isFlyout });
    const kucalc = useTypedRedux("customize", "kucalc");
    const cocalcCom = kucalc === KUCALC_COCALC_COM;
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
      const dedicatedVM = (
        <>
          If you need more RAM or CPU, consider using a{" "}
          <A href={"https://doc.cocalc.com/compute_server.html"}>
            Compute Server
          </A>
          .
        </>
      );

      const dedicatedDisk = (
        <>
          It is possible to attach{" "}
          <A href={DOC_CLOUD_STORAGE_URL}>files hosted online</A>.
        </>
      );

      const idleTimeoutInfo = (
        <>
          To increase the idle timeout, upgrade your membership or enable the
          "always running" quota.
        </>
      );

      switch (record.key) {
        case "memory_request":
        case "memory_limit":
        case "cpu_limit":
        case "cpu_request":
          return cocalcCom ? dedicatedVM : <></>;
        case "disk_quota":
          return cocalcCom ? dedicatedDisk : <></>;
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
          <QuestionMarkText tip="If the project stops or the underlying VM goes into maintenance, the project will automatically restart.">
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
          <QuestionMarkText tip="Usage limit imposed by the current quota configuration. Change your membership to adjust this limit. Project needs to run in order to see the effective runtime quota.">
            Limit
          </QuestionMarkText>
        );
      } else {
        return (
          <Tip
            tip={`The project is currently not running. The data is stale from the last run. Start the project to see the effective quotas.`}
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
