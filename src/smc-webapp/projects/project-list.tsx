/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { WindowedList } from "../r_misc/windowed-list";
import { LoadAllProjects } from "./load-all";
import { ProjectRow } from "./project-row";

interface Props {
  projects: string[]; // array of project ids
}

export const ProjectList: React.FC<Props> = ({ projects }) => {
  function render_project({
    index,
  }: {
    index: number;
  }): JSX.Element | undefined {
    if (index === projects.length) {
      return <LoadAllProjects />;
    }
    const project_id = projects[index];
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
      row_count={projects.length + 1}
      row_renderer={render_project}
      row_key={(index) => projects[index] ?? "button"}
      cache_id={"projects"}
    />
  );
};
