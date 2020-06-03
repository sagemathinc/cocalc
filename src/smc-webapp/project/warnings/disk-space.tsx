import { Alert } from "../../antd-bootstrap";
import {
  React,
  useMemo,
  useRedux,
  redux,
  useActions,
} from "../../app-framework";
import { Icon } from "../../r_misc";
import { ALERT_STYLE } from "./common";

export const DiskSpaceWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useRedux(["customize", "is_commercial"]);
  const quotas = useMemo(
    () =>
      is_commercial
        ? redux.getStore("projects").get_total_project_quotas(project_id)
        : undefined,
    [project, is_commercial]
  );

  const actions = useActions(project_id);

  if (
    !is_commercial ||
    project == null ||
    quotas == null ||
    quotas.disk_quota == null
  ) {
    // never show a warning if project not loaded or commercial not set
    return null;
  }

  const project_status = project.get("status");
  const disk_usage = project_status?.get("disk_MB");
  if (disk_usage == null || disk_usage < quotas.disk_quota - 5) {
    return null;
  }

  return (
    <Alert bsStyle="danger" style={ALERT_STYLE}>
      <Icon name="exclamation-triangle" /> WARNING: This project is running out
      of disk space ({disk_usage} MB used of {quotas.disk_quota} MB available).
      Increase the "Disk Space" quota in{" "}
      <a onClick={() => actions.set_active_tab("settings")}>project settings</a>{" "}
      or{" "}
      <a onClick={() => actions.set_active_tab("files")}>delete some files</a>.
    </Alert>
  );
};
