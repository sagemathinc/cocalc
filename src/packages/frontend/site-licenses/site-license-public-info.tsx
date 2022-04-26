/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { trunc, unreachable } from "@cocalc/util/misc";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import {
  isLicenseStatus,
  LicenseStatus,
  LicenseStatusOptions,
} from "@cocalc/util/upgrades/quota";
import { Alert, Button, Popconfirm, Table, Tag, Tooltip } from "antd";
import { reuseInFlight } from "async-await-utils/hof";
import { isEqual } from "lodash";
import { alert_message } from "../alerts";
import {
  React,
  redux,
  useEffect,
  useIsMountedRef,
  usePrevious,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { SiteLicensePublicInfo } from "./site-license-public-info-component";
import { SiteLicensePublicInfo as Info, SiteLicenses } from "./types";
import { site_license_public_info, trunc_license_id } from "./util";

interface PropsTable {
  site_licenses: SiteLicenses;
  project_id?: string; // if not given, just provide the public info about the license (nothing about if it is upgrading a specific project or not) -- this is used, e.g., for the course configuration page
  restartAfterRemove?: boolean; // default false
  showRemoveWarning?: boolean; // default true
  onRemove?: (license_id: string) => void; // called *before* the license is removed!
  warn_if?: (info, license_id) => void | string;
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
}

export const SiteLicensePublicInfoTable: React.FC<PropsTable> = (
  props: PropsTable
) => {
  const {
    site_licenses,
    project_id,
    restartAfterRemove = false,
    onRemove,
    warn_if,
  } = props;

  const isMountedRef = useIsMountedRef();
  const [loading, setLoading] = useState<boolean>(true);
  // string is an error, Info the actual license data
  const [infos, setInfos] = useState<
    { [license_id: string]: Info } | undefined
  >(undefined);
  const [errors, setErrors] = useState<{ [license_id: string]: string }>({});
  const [data, setData] = useState<TableRow[]>([]);
  const prevSiteLicense = usePrevious(site_licenses);

  useEffect(() => {
    // Optimization: check in redux store for first approximation of
    // info already available locally
    let infos = redux.getStore("billing").getIn(["managed_licenses"]);
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
    force: boolean = false
  ): Promise<void> {
    setLoading(true);
    const infos: { [license_id: string]: Info } = {};
    const errors: { [license_id: string]: string } = {};

    await Promise.all(
      Object.keys(site_licenses).map(async function (license_id) {
        try {
          infos[license_id] = await site_license_public_info(license_id, force);
        } catch (err) {
          errors[license_id] = `${err}`;
        }
      })
    );

    if (!isMountedRef.current) return;
    setInfos(infos);
    setErrors(errors);
    setLoading(false);
  });

  function calcStatus(k, v): LicenseStatus {
    const upgrades = site_licenses?.[k];
    const status_val = upgrades?.get("status");
    if (isLicenseStatus(status_val)) {
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

  // derive table row data from site license and fetched infos
  useEffect(() => {
    if (infos == null) return;

    setData(
      Object.entries(infos)
        // sort by UUID, to make the table stable
        .sort(([a, _a], [b, _b]) => (a < b ? -1 : a > b ? 1 : 0))
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
            is_manager: v.is_manager ?? false,
            activates: v.activates,
            expires: v.expires,
            expired,
          };
        })
    );
  }, [site_licenses, infos]);

  function rowInfo(rec: TableRow): JSX.Element {
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
      case "active":
        return "green";
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
    const status: LicenseStatus = rec.status ?? "valid";
    const color = renderStatusColor(status);
    const info = LicenseStatusOptions[status];
    const text = status === "expired" ? status.toUpperCase() : status;
    const style = status === "expired" ? { fontSize: "110%" } : {};
    return (
      <Tooltip title={info}>
        <Tag style={style} color={color}>
          {text}
        </Tag>
      </Tooltip>
    );
  }

  function activatesExpires(rec: TableRow): JSX.Element {
    if (rec.activates != null && rec.activates > new Date()) {
      return (
        <>
          Will activate in <TimeAgo date={rec.activates} />.
        </>
      );
    } else {
      const word = rec.expired ? "EXPIRED" : "Will expire";
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
      return (
        <>
          {word} {when}.
        </>
      );
    }
  }

  function renderStatusText(rec: TableRow): JSX.Element {
    const quota: SiteLicenseQuota | undefined = infos?.[rec.license_id]?.quota;
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

  function renderLicense(rec: TableRow): JSX.Element {
    // as a fallback, we show the truncated license id
    const title = rec.title ? rec.title : trunc_license_id(rec.license_id);
    return (
      <>
        <strong>{title}</strong>
        {rec.description && (
          <>
            <br />
            {trunc(rec.description, 30)}
          </>
        )}
        <p>
          {renderStatusText(rec)}
          <br />
          {activatesExpires(rec)}
        </p>
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

  function renderRemoveButton(license_id): JSX.Element {
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
        <Button>
          <Icon name="times" />
        </Button>
      </Popconfirm>
    );
  }

  function renderRemove(license_id: string): JSX.Element | undefined {
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
        key={idx}
        message={`Error fetching information of license ${idx + 1} -- ${err}`}
      />
    ));
  }

  function renderReload(): JSX.Element {
    return (
      <Tooltip placement="bottom" title={"Reload license information"}>
        <Button onClick={() => fetchInfos(true)}>
          <Icon name="redo" />
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      {renderErrors()}
      <Table<TableRow>
        loading={loading}
        dataSource={data}
        rowClassName={() => "cursor-pointer"}
        pagination={{ hideOnSinglePage: true, defaultPageSize: 5 }}
        expandable={{
          expandedRowRender: (record) => rowInfo(record),
          expandRowByClick: true,
        }}
      >
        <Table.Column<TableRow>
          key="status"
          title="Status"
          dataIndex="status"
          align="center"
          render={(_, rec) => renderStatus(rec)}
        />
        <Table.Column<TableRow>
          key="title"
          title="License"
          dataIndex="title"
          render={(_, rec) => renderLicense(rec)}
        />
        <Table.Column<TableRow>
          key="actions"
          title={renderReload()}
          dataIndex="license_id"
          align={"right"}
          render={(license_id) => renderRemove(license_id)}
        />
      </Table>
    </>
  );
};
