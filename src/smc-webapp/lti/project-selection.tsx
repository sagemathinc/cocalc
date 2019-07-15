import * as React from "react";
import styled from "styled-components";

export function ProjectSelection({ projects }: { projects: any[] }) {
  const project_rows: any[] = [];

  projects.map(project => {
    project_rows.push(
      <ProjectRow key={project.project_id}>{project.title}</ProjectRow>
    );
  });

  return <>{project_rows}</>;
}

const ProjectRow = styled.div`
  color: tomato;
  border-color: tomato;
`;
