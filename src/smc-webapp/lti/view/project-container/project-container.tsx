import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";

import { FileListing } from "./file-listing";
import { FinishSelectionButton } from "./finish-selection-button";
import * as API from "../../api";
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
          working_directory={current_path}
          file_listings={file_listings}
          opened_directories={opened_directories}
          selected_entries={selected_entries}
          excluded_entries={excluded_entries}
          on_select={path => {
            dispatch({
              type: "add_entry",
              project_id,
              path
            });
          }}
          on_deselect={path => {
            dispatch({
              type: "remove_entry",
              project_id,
              path
            });
          }}
          on_file_click={(path: string, is_checked) => {
            if (is_checked) {
              dispatch({
                type: "remove_entry",
                project_id,
                path
              });
            } else {
              dispatch({
                type: "add_entry",
                project_id,
                path
              });
            }
          }}
          on_directory_click={(path: string, is_open: boolean) => {
            if (is_open) {
              dispatch({ type: "close_directory", path: path, project_id });
            } else {
              dispatch({ type: "open_directory", path: path, project_id });
              API.fetch_directory_listing(project_id, path, dispatch);
            }
          }}
        />
      );
    }

    return (
      <ProjectContainerRoot>
        <ProjectTitle>Select assignment contents</ProjectTitle>
        {opened_project.title}
        <br />
        {"<"} Back
        <FinishSelectionButton
          on_click={_ => {
            dispatch({ type: "finished_selecting_entries" });
          }}
        />
        <br />
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
