/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Testing manually from frontend console:

a = cc.redux.getActions('projects')
s = cc.redux.getStore('projects')
project_map = s.get('project_map').toJS(); project_map['56eb622f-d398-489a-83ef-c09f1a1e8094'].status.memory = {rss:950*1000,limit:1000*1000}; a.setState({project_map})


*/

import { Alert } from "antd";
import {
  React,
  useRedux,
  useTypedRedux,
  useActions,
  useCounter,
} from "../../app-framework";
import { useEffect, useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { useIntl } from "react-intl";

const OOM_INFO_PAGE = "https://doc.cocalc.com/howto/low-memory.html";
const OOM_VIDEO = "https://youtu.be/i5qGwXlo-2I";
const DISMISS_TIME_MS = 3 * 60 * 1000;

export const RamWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const [hideUntil, setHideUntil] = useState<number>(0);
  const { val, inc } = useCounter();

  const shouldShow = () => {
    if (hideUntil > Date.now()) {
      return false;
    }
    if (!is_commercial || project == null) {
      // never show a warning if project not loaded or commercial not set
      return false;
    }
    const memory = project.getIn(["status", "memory"]);
    if (memory == null) {
      return false;
    }
    const rss = memory.get("rss");
    const limit = memory.get("limit");
    if (!rss || !limit) {
      return false;
    }
    const rss_mb = toMB(rss);
    const limit_mb = toMB(limit);
    if (rss_mb < limit_mb - 100) {
      // well within quota
      return false;
    }
    return true;
  };
  const [open, setOpen] = useState<boolean>(shouldShow());

  useEffect(() => {
    setOpen(shouldShow());
  }, [is_commercial, project, val]);

  if (!open) {
    return null;
  }

  return (
    <Banner
      memory={project.getIn(["status", "memory"])}
      project_id={project_id}
      onClose={() => {
        // dismiss for for a while, no matter what
        const hideUntil = Date.now() + DISMISS_TIME_MS;
        setTimeout(() => {
          // increment counter, which causes check again if should display banner
          inc();
        }, DISMISS_TIME_MS + 1000);
        setHideUntil(hideUntil);
        setOpen(false);
      }}
    />
  );
};

function toMB(s) {
  return Math.round((s ?? 0) / 1000);
}

function Banner({ memory, project_id, onClose }) {
  const actions = useActions({ project_id });
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const rss_mb = toMB(memory?.get("rss"));
  const limit_mb = toMB(memory?.get("limit"));
  return (
    <Alert
      closable
      onClose={onClose}
      type="warning"
      style={{ border: "none" }}
      showIcon
      message={
        <b style={{ color: "#666" }}>
          {rss_mb < limit_mb ? (
            <>This {projectLabelLower} is running low on RAM memory</>
          ) : (
            <>This {projectLabelLower} is out of RAM memory</>
          )}{" "}
          {!!rss_mb && (
            <>
              ({rss_mb} MB used of {limit_mb} MB available)
            </>
          )}
        </b>
      }
      description={
        <div>
          Increase the RAM memory in{" "}
          <a onClick={() => actions?.set_active_tab("upgrades")}>
            {projectLabelLower} upgrades
          </a>
          , read about{" "}
          <A href={OOM_INFO_PAGE}>how to reduce your memory usage</A> and watch{" "}
          <A href={OOM_VIDEO}>
            <Icon name="youtube" style={{ color: "red", marginLeft: "5px" }} />{" "}
            Overcoming CoCalc's Memory Limits
          </A>
          .
        </div>
      }
    />
  );
}
