import * as React from "react";

export function ProjectContainer({ opened_project_id, projects, dispatch }) {
  const opened_project = projects[opened_project_id];
  if (opened_project == undefined) {
    return (
      <>
        Error, `{opened_project_id}` not found in `{projects}`
      </>
    );
  } else {
    return <>{opened_project.title}</>;
  }
}
