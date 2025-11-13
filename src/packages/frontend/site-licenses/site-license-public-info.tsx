/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { QuestionCircleOutlined } from "@ant-design/icons";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { Alert, Button, Popconfirm, Popover, Table, Tag, Tooltip } from "antd";
import { isEqual } from "lodash";
import { ReactNode } from "react";
import { useIntl } from "react-intl";
import { isValidUUID } from "@cocalc/util/misc";

import {
  React,
  redux,
  useEffect,
  useIsMountedRef,
  usePrevious,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Loading,
  QuestionMarkText,
  TimeAgo,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectState } from "@cocalc/frontend/project/page/project-state-hook";
import Export from "@cocalc/frontend/purchases/export";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { cmp, plural, trunc, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import {
  LicenseStatus,
  LicenseStatusOptions,
  Reason,
  ReasonsExplanation,
  isLicenseStatus,
} from "@cocalc/util/upgrades/quota";
import { alert_message } from "../alerts";
import { SiteLicensePublicInfo } from "./site-license-public-info-component";
import type { SiteLicensePublicInfo as Info, SiteLicenses } from "./types";
import { site_license_public_info, trunc_license_id } from "./util";

interface PropsTable {
  site_licenses: SiteLicenses;
  project_id?: string; // if not given, just provide the public info about the license (nothing about if it is upgrading a specific project or not) -- this is used, e.g., for the course configuration page
  restartAfterRemove?: boolean; // default false
  showRemoveWarning?: boolean; // default true
  onRemove?: (license_id: string) => void; // called *before* the license is removed!
  warn_if?: (info, license_id) => void | string | ReactNode;
  mode?: "project" | "flyout";
}

interface TableRow {
  key: number;
  license_id: string;
  title?: string;
  description?: string;
  is_manager: boolean;
  activates?: Date;
  expires?: Date;
  expired: boolean; // true if expired, with a bit of heuristics
  status: LicenseStatus; // see calcStatus for what's going on
  reason?: string | null; // expand Reason to an actual explanation
}

export const SiteLicensePublicInfoTable: React.FC<PropsTable> = (
  props: Readonly<PropsTable>,
) => {
  const {
    site_licenses,
    project_id,
    restartAfterRemove = false,
    onRemove,
    warn_if,
    mode = "project",
  } = props;

  const isFlyout = mode === "flyout";
  const intl = useIntl();
  const isMountedRef = useIsMountedRef();
  const [loading, setLoading] = useState<boolean>(true);
  // string is an error, Info the actual license data
  const [infos, setInfos] = useState<
    { [license_id: string]: Info } | undefined
  >(undefined);
  const [errors, setErrors] = useState<{ [license_id: string]: string }>({});
  const [data, setData] = useState<TableRow[]>([]);
  const prevSiteLicense = usePrevious(site_licenses);
  const project_state = useProjectState(project_id);
  const projectIsRunning = project_state?.get("state") === "running";

  useEffect(() => {
    // Optimization: check in redux store for first approximation of
    // info already available locally
    let infos = redux.getStore("billing").get("managed_licenses");
    if (infos != null) {
      const infos2 = infos.toJS() as { [license_id: string]: Info };
      // redux store *only* has entries that are managed.
      Object.values(infos2).forEach((v) => (v.is_manager = true));
      setInfos(infos2);
    }

    // Now launch async fetch from database.  This has more info, e.g., number of
    // projects that are running right now.
    fetchInfos(true);
  }, []);

  useEffect(() => {
    // site_licenses changed (we have to be careful, it's a plain object)
    // hence we fetch everything again (it's a little bit cached, so fine)
    if (!isEqual(prevSiteLicense, site_licenses)) {
      fetchInfos(true);
    }
  }, [site_licenses]);

  const fetchInfos = reuseInFlight(async function (
    force: boolean = false,
  ): Promise<void> {
    await redux.getActions("billing").update_managed_licenses();
    setLoading(true);
    const infos: { [license_id: string]: Info } = {};
    const errors: { [license_id: string]: string } = {};

    await Promise.all(
      Object.keys(site_licenses).map(async function (license_id) {
        try {
          if(!isValidUUID(license_id)) {
            return;
          }
          const info = await site_license_public_info(license_id, force);
          if (info == null) {
            throw new Error(`license '${license_id}' not found`);
          }
          infos[license_id] = info;
        } catch (err) {
          errors[license_id] = `${err}`;
        }
      }),
    );

    if (!isMountedRef.current) return;
    setInfos(infos);
    setErrors(errors);
    setLoading(false);
  });

  function calcStatus(k, v): LicenseStatus {
    const upgrades = site_licenses?.[k];
    const status_val = upgrades?.get("status");
    // if project is not running, we do not have an updated info about the status
    // do the else-fallthrough, which is to use the date.
    if (projectIsRunning && isLicenseStatus(status_val)) {
      return status_val;
    } else {
      // right after loading this the first time, the field is null.
      if (v.expires == null) {
        return "valid";
      }
      if (new Date() >= v.expires) {
        return "expired";
      } else if (new Date() < v.activates) {
        return "future";
      } else {
        return "valid";
      }
    }
  }

  function getReason(k, status: LicenseStatus): string | undefined {
    const licenseInfo = site_licenses?.[k];
    if (licenseInfo == null) return;

    // special case: tell user why it is active, when valid
    switch (status) {
      case "active": {
        const activates = infos?.[k]?.activates;
        const run_limit = infos?.[k]?.run_limit ?? 1;
        if (activates instanceof Date) {
          const end = activates.toISOString().slice(0, 10);
          return `The license activated on ${end}, is still active, and its run limit of ${run_limit} has not been exhausted when the project started.`;
        }
        return;
      }

      case "exhausted": {
        const run_limit = infos?.[k]?.run_limit ?? 1;
        return `The run limit of ${run_limit} has been exhausted when the project started. Other projects, which are upgraded by this license, have to stop in order to make it possible to activate this license for this project.`;
      }

      case "future": {
        const activates = infos?.[k]?.activates;
        if (activates instanceof Date) {
          const end = activates.toISOString().slice(0, 10);
          return `The license will activate on ${end}.`;
        }
        return;
      }
    }

    // below, this is mainly to dissect the status "ineffective".

    const reason: Reason | undefined = licenseInfo.get("reason");
    if (reason == null) return;
    if (ReasonsExplanation[reason] != null) {
      return ReasonsExplanation[reason];
    }

    switch (reason) {
      case "expired": // elaborate why expired
        const expires = infos?.[k]?.expires;
        if (expires instanceof Date) {
          const end = expires.toISOString().slice(0, 10);
          return `The license expired on ${end}.`;
        }
    }
  }

  // derive table row data from site license and fetched infos
  useEffect(() => {
    if (infos == null) return;

    setData(
      Object.entries(infos)
        // sort by most recently created, since recent licenses are more likely to be of interest
        .sort(([_id, a], [_id2, b]) => -cmp(a.created, b.created))
        // process all values
        .map(([k, v], idx) => {
          // we check if we definitely know the status, otherwise use the date
          // if there is no information, we assume it is valid
          const status = calcStatus(k, v);
          const expired =
            status === "expired"
              ? true
              : v?.expires != null
                ? new Date() >= v.expires
                : false;
          return {
            key: idx,
            license_id: k,
            title: v?.title,
            description: v?.description,
            status,
            reason: getReason(k, status),
            is_manager: v.is_manager ?? false,
            activates: v.activates,
            expires: v.expires,
            expired,
          };
        }),
    );
  }, [site_licenses, infos]);

  function rowInfo(rec: TableRow): React.JSX.Element {
    return (
      <SiteLicensePublicInfo
        license_id={rec.license_id}
        project_id={project_id}
        upgrades={site_licenses?.[rec.license_id]}
        onRemove={onRemove != null ? () => onRemove(rec.license_id) : undefined}
        warn_if={
          warn_if != null ? (info) => warn_if(info, rec.license_id) : undefined
        }
        restartAfterRemove={restartAfterRemove}
        tableMode={true}
      />
    );
  }

  function renderStatusColor(status: LicenseStatus) {
    switch (status) {
      case "valid":
        return "green";
      case "active":
        return "darkgreen";
      case "expired":
        return "darkred";
      case "exhausted":
        return "red";
      case "future":
        return "geekblue";
      case "ineffective":
        return "gray";
      default:
        unreachable(status);
    }
  }

  function renderStatus(rec: TableRow) {
    // this prevents briefly showing invlid/expired, despite being valid
    if (loading) return <Loading />;
    const status: LicenseStatus = rec.status ?? "valid";
    const color = renderStatusColor(status);
    const info = LicenseStatusOptions[status];
    const text = status === "expired" ? status.toUpperCase() : status;
    const style = status === "expired" ? { fontSize: "110%" } : {};
    const extra = rec.reason && {
      content: <div style={{ maxWidth: "300px" }}>{rec.reason}</div>,
    };
    return (
      <Popover title={info} trigger={["hover", "click"]} {...extra}>
        <Tag style={style} color={color} onClick={(e) => e.stopPropagation()}>
          {text} {rec.reason && <QuestionCircleOutlined />}
        </Tag>
      </Popover>
    );
  }

  function runLimitAndExpiration(rec: TableRow): React.JSX.Element {
    const delimiter = isFlyout ? <br /> : " ";
    const runLimit = infos?.[rec.license_id]?.run_limit ?? 1;

    const runLimitTxt = `Upgrades up to ${runLimit} running ${plural(
      runLimit,
      "project",
    )}.`;

    if (rec.activates != null && rec.activates > new Date()) {
      return (
        <>
          {runLimitTxt}
          {delimiter}Will activate in <TimeAgo date={rec.activates} />.
        </>
      );
    } else {
      if (rec?.expires == null) {
        return (
          <>
            {runLimitTxt}
            {delimiter}Has no expiration date.
          </>
        );
      }

      const when =
        rec?.expires != null ? (
          <TimeAgo date={rec.expires} />
        ) : rec.expired ? (
          "in the past"
        ) : rec?.expires != null ? (
          "in the future"
        ) : (
          "never"
        );

      if (rec.expired) {
        return (
          <>
            Expired {when}.{delimiter}Could upgrade {runLimit} running{" "}
            {plural(runLimit, "project")}.
          </>
        );
      }

      return (
        <>
          {runLimitTxt} Valid through {when}.
        </>
      );
    }
  }

  function renderStatusText(rec: TableRow): React.JSX.Element {
    const licenseInfo = infos?.[rec.license_id];
    if (!licenseInfo) return <></>;
    const quota: SiteLicenseQuota | undefined = licenseInfo.quota;

    if (quota?.dedicated_disk || quota?.dedicated_vm) {
      return <>{describe_quota(quota)}</>;
    }

    if (quota != null && rec.status === "valid") {
      return <>{describe_quota(quota)}</>;
    }

    const descr = LicenseStatusOptions[rec.status];
    if (typeof descr === "string" && descr.length > 0) {
      return <>{descr}</>;
    }

    return <>{rec.status}</>;
  }

  function renderLicense(rec: TableRow): React.JSX.Element {
    // as a fallback, we show the truncated license id
    const title = rec.title ? rec.title : trunc_license_id(rec.license_id);
    return (
      <>
        <div style={{ fontWeight: "bold" }}>
          {title}

          {isFlyout ? (
            <span style={{ float: "right" }}>{renderStatus(rec)}</span>
          ) : undefined}
        </div>
        {rec.description && (
          <>
            <br />
            {trunc(rec.description, 30)}
          </>
        )}
        <div>
          {runLimitAndExpiration(rec)}
          <br />
          {renderStatusText(rec)}
          {isFlyout ? renderRemove(rec.license_id) : undefined}
        </div>
      </>
    );
  }

  function restartProject(): void {
    if (!project_id) return;
    const actions = redux.getActions("projects");
    const store = redux.getStore("projects");
    if (store.get_state(project_id) === "running") {
      actions.restart_project(project_id);
    }
  }

  async function removeLicense(license_id: string): Promise<void> {
    // this might be called with license_id + onRemove set, but no project_id
    if (typeof onRemove === "function") {
      onRemove(license_id);
    }
    if (!project_id) return;
    const actions = redux.getActions("projects");
    // newly added licenses
    try {
      await actions.remove_site_license_from_project(project_id, license_id);
    } catch (err) {
      alert_message({
        type: "error",
        message: `Unable to remove license key -- ${err}`,
      });
      return;
    }
    if (restartAfterRemove) {
      restartProject();
    }
  }

  function renderRemoveExtra(license_id: string) {
    if (data[license_id]?.status !== "valid") return;

    return (
      <>
        The project will no longer get upgraded using this license.{" "}
        {restartAfterRemove && (
          <>
            <br />
            <strong>
              It will also restart, interrupting any running computations.
            </strong>
          </>
        )}
      </>
    );
  }

  function renderRemoveButton(license_id: string): React.JSX.Element {
    return (
      <Popconfirm
        title={
          <div>
            Are you sure you want to remove this license?
            {renderRemoveExtra(license_id)}
          </div>
        }
        onConfirm={() => removeLicense(license_id)}
        okText={"Remove"}
        cancelText={"Keep"}
      >
        <Button
          type={isFlyout ? "link" : "default"}
          style={
            isFlyout ? { padding: 0, color: COLORS.ANTD_RED_WARN } : undefined
          }
        >
          <Icon name="times" />
          {isFlyout ? " Remove..." : undefined}
        </Button>
      </Popconfirm>
    );
  }

  function renderRemove(license_id: string): React.JSX.Element | undefined {
    // we can only remove from within a project
    if (!project_id && onRemove == null) return;
    // div hack: https://github.com/ant-design/ant-design/issues/7233#issuecomment-356894956
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Tooltip placement="bottom" title={"Remove this license"}>
          {renderRemoveButton(license_id)}
        </Tooltip>
      </div>
    );
  }

  function renderErrors() {
    if (Object.keys(errors).length === 0) return;
    return Object.values(errors).map((err, idx) => (
      <Alert
        type="error"
        showIcon={false}
        closable={true}
        banner={true}
        key={idx}
        message={`Error fetching information of license ${idx + 1}: ${err}`}
      />
    ));
  }

  function renderButtons(): React.JSX.Element {
    return (
      <div style={{ display: "flex" }}>
        <Tooltip placement="bottom" title={"Reload license information"}>
          <Button type="link" onClick={() => fetchInfos(true)}>
            <Icon name="refresh" /> {intl.formatMessage(labels.refresh)}
          </Button>
        </Tooltip>
        <Export data={data} name="licenses" style={{ marginLeft: "8px" }} />
      </div>
    );
  }

  return (
    <>
      {renderErrors()}
      <Table<TableRow>
        loading={loading}
        dataSource={data}
        showHeader={!isFlyout}
        size={isFlyout ? "small" : undefined}
        className={"cc-license-table-public-info"}
        rowClassName={() => "cursor-pointer"}
        pagination={{ hideOnSinglePage: true, defaultPageSize: 25 }}
        expandable={{
          expandedRowRender: (record) => rowInfo(record),
          expandRowByClick: true,
          expandIcon: isFlyout ? () => <></> : undefined,
        }}
      >
        {isFlyout ? undefined : (
          <Table.Column<TableRow>
            key="status"
            title={intl.formatMessage(labels.status)}
            dataIndex="status"
            align="center"
            render={(_, rec) => renderStatus(rec)}
          />
        )}
        <Table.Column<TableRow>
          key="title"
          title={
            <QuestionMarkText
              tip={intl.formatMessage({
                id: "site-licenses-public-info.license-column.help",
                defaultMessage:
                  "License information. Click on a row to expand details.",
              })}
            >
              {intl.formatMessage(labels.license)}
            </QuestionMarkText>
          }
          dataIndex="title"
          render={(_, rec) => renderLicense(rec)}
          width={isFlyout ? "100%" : undefined}
        />
        {isFlyout ? undefined : (
          <Table.Column<TableRow>
            key="actions"
            title={renderButtons()}
            dataIndex="license_id"
            align={"right"}
            render={(license_id) => renderRemove(license_id)}
          />
        )}
      </Table>
    </>
  );
};
