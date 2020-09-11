/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { COMPUTE_STATES } from "smc-util/schema";
import { ProjectStatus } from "../todo-types";
import { Space } from "./space";
import { TimeAgo } from "./time-ago";
import { Loading } from "./loading";
import { Icon } from "./icon";

interface Props {
  state?: ProjectStatus;
  show_desc?: boolean;
}

export const ProjectState: React.FC<Props> = ({ state, show_desc }) => {
  function render_spinner() {
    return (
      <span style={{ marginRight: "15px" }}>
        ... <Icon name="cc-icon-cocalc-ring" spin />
      </span>
    );
  }

  function render_desc(desc) {
    if (!show_desc) {
      return;
    }
    return (
      <span>
        <span style={{ fontSize: "11pt" }}>
          {desc}
          {render_time()}
        </span>
      </span>
    );
  }

  function render_time() {
    const time = state?.get("time");
    if (time) {
      return (
        <span>
          <Space /> (<TimeAgo date={time} />)
        </span>
      );
    }
  }

  const s = COMPUTE_STATES[state?.get("state")];
  if (s == null) {
    return <Loading />;
  }
  const { display, desc, icon, stable } = s;
  return (
    <span>
      <Icon name={icon} /> {display}
      <Space />
      {!stable && render_spinner()}
      {render_desc(desc)}
    </span>
  );
};
