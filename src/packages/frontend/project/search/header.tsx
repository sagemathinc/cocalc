/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CloseX2, Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "../context";
import { PathNavigator } from "../explorer/path-navigator";

const SIZE = "20px";

export function ProjectSearchHeader() {
  const { project_id, actions } = useProjectContext();
  return (
    <div style={{ marginTop: "0px", fontSize: SIZE }}>
      <Icon name="search" /> Search{" "}
      <span className="hidden-xs">
        {" in "}
        <PathNavigator
          project_id={project_id}
          style={{ display: "inline-block", fontSize: SIZE }}
        />
      </span>
      <CloseX2 close={() => actions?.set_active_tab("home")} />
    </div>
  );
}
