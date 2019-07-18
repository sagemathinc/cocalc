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
    if (!project.users[account_id].hide) {
      project_rows.push(
        <ProjectRow key={project.project_id} onClick={dispatch()}>{project.title}</ProjectRow>
      );
    }
  });

  return <>{project_rows}</>;
}

const ProjectRow = styled.div`
  color: tomato;
  border-color: tomato;
`;
