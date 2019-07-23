import * as React from "react";
import styled from "styled-components";
import { Action, Projects } from "./state/types";
import * as API from "./api";

export function ProjectSelection({
  projects,
  account_id,
  dispatch
}: {
  projects: Projects;
  account_id: string;
  dispatch: (action: Action) => void;
}) {
  const project_rows: any[] = [];

  Object.entries(projects).map(([_, project]) => {
    // Filter out hidden and deleted projects
    if (!project.users[account_id].hide && !project.deleted) {
      project_rows.push(
        <ProjectRow
          key={project.project_id}
          onClick={() => {
            API.fetch_directory_listing(project.project_id, "", dispatch);
            dispatch({ type: "open_project", id: project.project_id });
          }}
        >
          {project.title}
        </ProjectRow>
      );
    }
  });

  return (
    <ProjectListContainer>
      <h2>Projects</h2>
      {project_rows}
    </ProjectListContainer>
  );
}

const ProjectListContainer = styled.div`
  margin: 0px 8px 8px 8px;
`;

const ProjectRow = styled.div`
  color: tomato;
  border-color: tomato;
`;
