import * as React from "react";
import styled from "styled-components";

import { FileListing } from "./file-listing";

export function ProjectContainer({
  opened_project_id,
  projects,
  file_listings,
  current_path,
  dispatch
}) {
  const opened_project = projects[opened_project_id];
  console.log("Presenting file listings:", file_listings);
  if (opened_project == undefined) {
    return (
      <>
        Error, `{opened_project_id}` not found in `{projects}`
      </>
    );
  } else {
    let content = <>Loading...</>;
    if (file_listings) {
      content = <FileListing listing={file_listings[current_path]} />;
    }
    return (
      <div>
        <ProjectTitle>{opened_project.title}</ProjectTitle>
        {content}
      </div>
    );
  }
}

const ProjectTitle = styled.h1`
  color: darkslategrey;
`;
