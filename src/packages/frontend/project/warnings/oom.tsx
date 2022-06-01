/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button } from "@cocalc/frontend/antd-bootstrap";
import {
  useEffect,
  useMemo,
  useRedux,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { join } from "path";
import { ALERT_STYLE } from "./common";

const OOM_ALERT_STYLE: React.CSSProperties = {
  ...ALERT_STYLE,
  ...{ fontSize: "11pt", padding: "10px" },
} as const;

const OOM_INFO_PAGE = "https://doc.cocalc.com/howto/low-memory.html";

// to test this, set the oom_kills value for your dev project directly in the DB:
// 1. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// 2. single event:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '1'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// click close button to hide banner, then
// 3. several more:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '5'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
// 4. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
export const OOMWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const [start_ts, set_start_ts] = useState<number | undefined>(undefined);
  const [oom_dismissed, set_oom_dismissed] = useState<number>(0);
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");

  // any licenses applied to project? → if yes, boost license
  const hasLicenseUpgrades = useMemo(() => {
    const licenses = project?.get("site_license")?.keySeq().toJS() ?? [];
    return licenses.length > 0;
  }, [project?.get("site_license")]);

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
    // never show a warning if project not loaded or commercial not set or project not running
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

  const cur_oom_dismissed = start_ts != cur_start_ts ? 0 : oom_dismissed;

  // first time message is different from later ones
  let style: undefined | "info" | "danger";
  let msg: JSX.Element;
  if (cur_oom_dismissed === 0) {
    if (cur_oom_kills > 1) {
      msg = (
        <span>
          WARNING: Several programs in your project crashed, because they ran
          out of memory.
        </span>
      );
    } else {
      msg = (
        <span>
          WARNING: A program in your project crashed, because it ran out of
          memory.
        </span>
      );
    }
    style = "info";
  } else {
    msg = (
      <span>
        WARNING: Yet again a program in your project crashed, because it ran out
        of memory.
      </span>
    );
    style = "danger";
  }

  function renderUpgrade() {
    if (hasLicenseUpgrades) {
      const boostUrl = join(appBasePath, "/store/boost");
      return (
        <A href={boostUrl} style={{ fontWeight: "bold" }}>
          boost memory quota
        </A>
      );
    } else {
      const slUrl = join(appBasePath, "/store/site-license");
      return (
        <A href={slUrl} style={{ fontWeight: "bold" }}>
          upgrade memory quota
        </A>
      );
    }
  }

  return (
    <Alert bsStyle={style} style={OOM_ALERT_STYLE}>
      <div style={{ display: "flex" }}>
        <div
          style={{
            flex: "0",
            fontSize: "150%",
            margin: "auto",
            paddingRight: "10px",
          }}
        >
          <Icon name="exclamation-triangle" />
        </div>
        <div style={{ flex: "1" }}>
          {msg}
          <br />
          Try <A href={OOM_INFO_PAGE}>some common solutions</A> to avoid this or{" "}
          {renderUpgrade()}.
        </div>
        <div style={{ flex: "0", margin: "auto" }}>
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
