/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { PathNavigator } from "../explorer/path-navigator";

const SIZE = "20px";

export const ProjectSearchHeader: React.FC = () => {
  const { project_id } = useProjectContext();

  return (
    <div style={{ marginTop: "0px", fontSize: SIZE }}>
      <Icon name="search" /> Search Contents of Files{" "}
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
