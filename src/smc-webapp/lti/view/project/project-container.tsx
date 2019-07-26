import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";

import * as API from "../../api";
import { FileListing } from "./file-listing";
import { Action, Projects } from "../../state/types";

interface Props {
  project_id: string;
  projects: Projects;
  file_listings: { [key: string]: string[] };
  current_path: string;
  selected_entries: Set<string>;
  dispatch: (action: Action) => void;
}

export function ProjectContainer({
  project_id,
  projects,
  file_listings,
  current_path = "",
  selected_entries = Set(),
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
    if (file_listings && file_listings[current_path]) {
      const on_click = path => {
        if (path[path.length - 1] === "/") {
          dispatch({ type: "open_directory", path: current_path + path });
          API.fetch_directory_listing(
            project_id,
            current_path + path,
            dispatch
          );
        } else {
          dispatch({
            type: "add_entry",
            project_id: project_id,
            path: current_path + path
          })
        }
      };
      content = (
        <>
          {current_path !== "" && (
            <ParentDirectory
              onClick={() => dispatch({ type: "open_parent_directory" })}
              role={"button"}
            >
              ▲ Parent Folder
            </ParentDirectory>
          )}
          <FileListing
            listing={file_listings[current_path].filter(path => {
              // Filter out hidden items
              return path[0] !== "." && path !== "";
            })}
            current_directory={current_path}
            selected_entries={selected_entries}
            on_path_click={on_click}
            on_select={path =>
              dispatch({
                type: "add_entry",
                project_id: project_id,
                path: current_path + path
              })
            }
            on_deselect={path =>
              dispatch({
                type: "remove_entry",
                project_id: project_id,
                path: current_path + path
              })
            }
          />
        </>
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

const ParentDirectory = styled.div`
  cursor: pointer;
  color: darkSlateBlue;
`;

const ProjectTitle = styled.h1`
  color: darkslategrey;
`;
