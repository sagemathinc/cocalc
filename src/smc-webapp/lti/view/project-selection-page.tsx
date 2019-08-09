import * as React from "react";
import styled from "styled-components";
import { Action, Projects } from "../state/types";
import * as API from "../api";

import { PageTitle } from "./shared";

export function ProjectSelectionPage({
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
          role={"button"}
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
      <PageTitle>Select a Project</PageTitle>
      {project_rows}
    </ProjectListContainer>
  );
}

const ProjectListContainer = styled.div`
  margin: 0rem 0.5rem 0.5rem 0.5rem;
`;

const ProjectRow = styled.div`
  cursor: pointer;
  color: tomato;
  border-color: tomato;
`;
