/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "../../antd-bootstrap";
import {
  React,
  useRedux,
  useTypedRedux,
  useActions,
} from "../../app-framework";
import { A, Icon } from "../../r_misc";
import { ALERT_STYLE } from "./common";
const OOM_INFO_PAGE = "https://doc.cocalc.com/howto/low-memory.html";

export const RamWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const actions = useActions({ project_id });

  if (!is_commercial || project == null) {
    // never show a warning if project not loaded or commercial not set
    return null;
  }
  const memory = project.getIn(["status", "memory"]);
  if (memory == null) return null;
  const rss = memory.get("rss");
  const limit = memory.get("limit");
  if (!rss || !limit) return null;
  const rss_mb = Math.round(rss / 1000);
  const limit_mb = Math.round(limit / 1000);
  if (rss_mb < limit_mb - 100) {
    // well within quota
    return null;
  }
  return (
    <Alert bsStyle="danger" style={ALERT_STYLE}>
      <Icon name="exclamation-triangle" /> WARNING: This project is running low
      on RAM memory ({rss_mb} MB used of {limit_mb} MB available). Increase the
      "Shared RAM" quota in{" "}
      <a onClick={() => actions.set_active_tab("settings")}>project settings</a>{" "}
      or <A href={OOM_INFO_PAGE}>learn how to reduce your memory usage</A>. This
      banner is updated about once per minute.
    </Alert>
  );
};
