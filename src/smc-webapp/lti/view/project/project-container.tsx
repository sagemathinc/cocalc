import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";

import { FileListing } from "./file-listing";
import { Action, Projects } from "../../state/types";

interface Props {
  project_id: string;
  projects: Projects;
  file_listings: { [key: string]: string[] };
  current_path: string;
  opened_directories: Set<string>;
  selected_entries: Set<string>;
  excluded_entries: Set<string>;
  dispatch: (action: Action) => void;
}

export function ProjectContainer({
  project_id,
  projects,
  file_listings,
  current_path = "",
  opened_directories = Set(),
  selected_entries = Set(),
  excluded_entries = Set(),
  dispatch
}: Props) {
  const opened_project = projects[project_id];
  if (opened_project == undefined) {
    return (
      <>
        Error, `{project_id}` not found in `{projects}`
      </>
    );
  } else {
    let content = <>Loading...</>;
    if (file_listings) {
      content = (
        <FileListing
          project_id={project_id}
          working_directory={current_path}
          file_listings={file_listings}
          opened_directories={opened_directories}
          selected_entries={selected_entries}
          excluded_entries={excluded_entries}
          dispatch={dispatch}
        />
      );
    }

    return (
      <ProjectContainerRoot>
        <ProjectTitle>{opened_project.title}</ProjectTitle>
        {content}
      </ProjectContainerRoot>
    );
  }
}

const ProjectContainerRoot = styled.div`
  margin: 0px 8px 8px 8px;
`;

const ProjectTitle = styled.h1`
  color: darkslategrey;
`;
