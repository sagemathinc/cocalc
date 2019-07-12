import * as React from "react";

export function ProjectSelection({ projects }: { projects: any[] }) {
  const project_rows: any[] = [];

  projects.map(project => {
    project_rows.push(<div key={project.project_id}>{project.title}</div>);
  });
  return <>{project_rows}</>;
}
