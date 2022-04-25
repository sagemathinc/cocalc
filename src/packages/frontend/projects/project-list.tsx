/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Virtuoso } from "react-virtuoso";
import { LoadAllProjects } from "./load-all";
import { ProjectRow } from "./project-row";

interface Props {
  visible_projects: string[]; // array of project ids
}

export default function ProjectList({ visible_projects }: Props) {
  return (
    <Virtuoso
      totalCount={visible_projects.length + 1}
      itemContent={(index) => {
        if (index == visible_projects.length) {
          return <LoadAllProjects />;
        }
        const project_id = visible_projects[index];
        if (project_id == null) {
          // should not happen
          return <div style={{ height: "1px" }}></div>;
        }
        return (
          <ProjectRow project_id={project_id} key={project_id} index={index} />
        );
      }}
    />
  );
}
