/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button } from "../../antd-bootstrap";
import { useEffect, useRedux, useState, useTypedRedux } from "../../app-framework";
import { A, Icon } from "../../components";
import { ALERT_STYLE } from "./common";
import * as LS from "../../misc/local-storage-typed";

const OOM_ALERT_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "15px" },
};

const OOM_INFO_PAGE = "https://doc.cocalc.com/howto/low-memory.html";

// to test this, set the oom_kills value for your dev project directly in the DB:
// 1. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// 2. single event:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '1'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// 3. several more:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '5'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// 4. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
export const OOMWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const [start_ts, set_start_ts] = useState<number | undefined>(undefined);
  const [oom_dismissed, set_oom_dismissed] = useState<number>(0);
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");

  // Load start_ts and oom_dismissed from local storage first time only.
  useEffect(() => {
    try {
      const val = JSON.parse(LS.get([project_id, "oom_dismissed"]) ?? "{}");
      if (val.start_ts != null) {
        set_start_ts(val.start_ts);
      }
      if (val.oom_dismissed != null) {
        set_oom_dismissed(val.oom_dismissed);
      }
    } catch (_err) {
      // ignore
    }
  }, []);

  function click(start_ts, oom_dismissed) {
    set_start_ts(start_ts);
    set_oom_dismissed(oom_dismissed);
    LS.set(
      [project_id, "oom_dismissed"],
      JSON.stringify({ start_ts, oom_dismissed })
    );
  }

  if (
    !is_commercial ||
    project == null ||
    project.getIn(["state", "state"]) != "running"
  ) {
    // never show a warning if project not loaded or commercial not set or project not running:
    return null;
  }

  const project_status = project.get("status");
  if (project_status == null) {
    return null;
  }
  const cur_oom_kills = project_status.get("oom_kills", 0);
  const cur_start_ts = project_status.get("start_ts");

  // either if there is no dismissed start_ts or it matches the current one
  if (cur_oom_kills === 0 || (start_ts !== null && start_ts === cur_start_ts)) {
    // and the number of oom kills is less or equal the number of dismissed ones
    if (cur_oom_kills <= oom_dismissed) {
      return null;
    }
  }
  let cur_oom_dismissed: number;
  if (start_ts != cur_start_ts) {
    cur_oom_dismissed = 0;
  } else {
    cur_oom_dismissed = oom_dismissed;
  }

  // first time message is different from later ones
  let style: undefined | "info" | "danger";
  let msg: JSX.Element;
  if (cur_oom_dismissed === 0) {
    if (cur_oom_kills > 1) {
      msg = (
        <span>
          WARNING: Several programs in your project just crashed because they
          ran out of memory.
        </span>
      );
    } else {
      msg = (
        <span>
          WARNING: A program in your project just crashed because it ran out of
          memory.
        </span>
      );
    }
    style = "info";
  } else {
    msg = (
      <span>
        WARNING: Another program in your project has crashed because it ran out
        of memory.
      </span>
    );
    style = "danger";
  }

  return (
    <Alert bsStyle={style} style={OOM_ALERT_STYLE}>
      <div style={{ display: "flex" }}>
        <div style={{ flex: "1" }}>
          <Icon name="exclamation-triangle" /> {msg} Try{" "}
          <A href={OOM_INFO_PAGE}>some common solutions</A> to avoid this.
        </div>
        <div style={{ flex: "0" }}>
          <Button
            onClick={() => click(cur_start_ts, cur_oom_kills)}
            style={{ float: "right" }}
          >
            Close
          </Button>
        </div>
      </div>
    </Alert>
  );
};
