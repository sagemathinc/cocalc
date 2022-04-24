/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "../../antd-bootstrap";
import {
  React,
  useMemo,
  useRedux,
  useTypedRedux,
  redux,
  useActions,
} from "../../app-framework";
import { Icon } from "../../components";
import { ALERT_STYLE } from "./common";

export const DiskSpaceWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const quotas = useMemo(
    () =>
      is_commercial
        ? redux.getStore("projects").get_total_project_quotas(project_id)
        : undefined,
    [project, is_commercial]
  );

  const actions = useActions({ project_id });

  if (
    !is_commercial ||
    project == null ||
    quotas == null ||
    quotas.disk_quota == null
  ) {
    // never show a warning if project not loaded or commercial not set
    return null;
  }

  // the disk_usage comes from the project.status datatbase entry – not the "project-status" synctable
  const project_status = project.get("status");
  const disk_usage = project_status?.get("disk_MB");
  if (disk_usage == null) return null;

  // it's fine if the usage is below the last 100MB or 90%
  if (disk_usage < Math.max(quotas.disk_quota * 0.9, quotas.disk_quota - 100)) {
    return null;
  }

  const disk_free = Math.max(0, quotas.disk_quota - disk_usage);

  return (
    <Alert bsStyle="danger" style={ALERT_STYLE}>
      <Icon name="exclamation-triangle" /> WARNING: This project is running out
      of disk space: only {disk_free} MB out of {quotas.disk_quota} MB
      available.{" "}
      <a onClick={() => actions?.set_active_tab("settings")}>
        Increase the "Disk Space" quota
      </a>
      {" or "}
      <a onClick={() => actions?.set_active_tab("files")}>delete some files</a>.
    </Alert>
  );
};
