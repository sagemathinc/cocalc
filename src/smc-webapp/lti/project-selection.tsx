import * as React from "react";
import styled from "styled-components";
import { Action, ProjectInfo } from "./state/types";

export function ProjectSelection({
  projects,
  account_id,
  dispatch
}: {
  projects: ProjectInfo[];
  account_id: string;
  dispatch: (action: Action) => void;
}) {
  const project_rows: any[] = [];

  projects.map(project => {
    // Filter out hidden and deleted projects
    if (!project.users[account_id].hide && !project.deleted) {
      project_rows.push(
        <ProjectRow
          key={project.project_id}
          onClick={() => {
            console.log("Clicked on", project.title);
            dispatch({ type: "open_project", id: project.project_id });
          }}
        >
          {project.title}
        </ProjectRow>
      );
    }
  });

  return <>{project_rows}</>;
}

const ProjectRow = styled.div`
  color: tomato;
  border-color: tomato;
`;
