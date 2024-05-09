/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "antd";
import {
  React,
  useRedux,
  useTypedRedux,
  useActions,
} from "../../app-framework";
import { A } from "../../components";
const OOM_INFO_PAGE = "https://doc.cocalc.com/howto/low-memory.html";
const OOM_VIDEO = "https://youtu.be/i5qGwXlo-2I";

export const RamWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");

  return <Banner rss_mb={1000} limit_mb={1000} project_id={project_id} />;

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
  return <Banner rss_mb={rss_mb} limit_mb={limit_mb} project_id={project_id} />;
};

function Banner({ rss_mb, limit_mb, project_id }) {
  const actions = useActions({ project_id });
  return (
    <Alert
      type="warning"
      style={{ border: "none" }}
      showIcon
      message={
        <>
          WARNING: This project is running low on RAM memory ({rss_mb} MB used
          of {limit_mb} MB available)
        </>
      }
      description={
        <div>
          Increase the RAM memory in{" "}
          <a onClick={() => actions?.set_active_tab("upgrades")}>
            project upgrades
          </a>
          , read about{" "}
          <A href={OOM_INFO_PAGE}>how to reduce your memory usage</A> or watch{" "}
          <A href={OOM_VIDEO}>
            Overcoming CoCalc's Memory Limits: The Ultimate Guide!
          </A>{" "}
          This banner is updated about once per minute.
        </div>
      }
    />
  );
}
