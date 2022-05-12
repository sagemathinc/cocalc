/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components";
import { PathNavigator } from "../explorer/path-navigator";

const SIZE = "20px";

export const ProjectSearchHeader: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
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
    </div>
  );
};