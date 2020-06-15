/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { WindowedList } from "../r_misc/windowed-list";
import { LoadAllProjects } from "./load-all";
import { ProjectRow } from "./project-row";

interface Props {
  visible_projects: string[]; // array of project ids
}

export const ProjectList: React.FC<Props> = ({ visible_projects }) => {
  function render_project({
    index,
  }: {
    index: number;
  }): JSX.Element | undefined {
    if (index === visible_projects.length) {
      return <LoadAllProjects />;
    }
    const project_id = visible_projects[index];
    if (project_id == null) {
      return;
    }
    return (
      <ProjectRow project_id={project_id} key={project_id} index={index} />
    );
  }

  return (
    <WindowedList
      overscan_row_count={3}
      estimated_row_size={90}
      row_count={visible_projects.length + 1}
      row_renderer={render_project}
      row_key={(index) => visible_projects[index] ?? "button"}
      cache_id={"visible_projects"}
    />
  );
};
