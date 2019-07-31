import * as React from "react";
import { Set } from "immutable";
import styled from "styled-components";

import * as API from "../../../api";
import { Action } from "../../../state/types";
import { ItemRow } from "./item-row";
import { CheckBox, Mark } from "./check-box";

interface Props {
  project_id: string;
  working_directory: string;
  file_listings: { [key: string]: string[] }; // Path: Children[]
  opened_directories: Set<string>;
  selected_entries: Set<string>;
  excluded_entries: Set<string>;
  is_root?: boolean;
  dispatch: (action: Action) => void;
}

// Recursively renders a directory listing and any opened sub-directories
export function FileListing(props: Props) {
  const {
    project_id,
    working_directory,
    file_listings,
    opened_directories,
    selected_entries,
    excluded_entries,
    is_root = true,
    dispatch
  } = props;

  let this_directory_is_selected = is_implicitly_included(
    working_directory,
    selected_entries,
    excluded_entries
  );
  const on_select = path => {
    dispatch({
      type: "add_entry",
      project_id: project_id,
      path: working_directory + path
    });
  };
  const on_deselect = path => {
    dispatch({
      type: "remove_entry",
      project_id: project_id,
      path: working_directory + path
    });
  };

  let on_click = _ => {};

  // Set onClick
  if (file_listings && file_listings[working_directory]) {
    on_click = path => {
      const full_path = working_directory + path;
      const is_directory = path[path.length - 1] === "/";
      if (is_directory) {
        if (opened_directories.has(full_path)) {
          dispatch({ type: "close_directory", path: full_path, project_id });
        } else {
          dispatch({ type: "open_directory", path: full_path, project_id });
        }
        API.fetch_directory_listing(
          project_id,
          working_directory + path,
          dispatch
        );
      } else {
        if (selected_entries.has(full_path)) {
          dispatch({
            type: "remove_entry",
            project_id: project_id,
            path: full_path
          });
        } else {
          dispatch({
            type: "add_entry",
            project_id: project_id,
            path: full_path
          });
        }
      }
    };
  } else {
    return <ListingWrapper indent={!is_root}>Loading...</ListingWrapper>;
  }

  // Filter out hidden items
  const listing = file_listings[working_directory].filter(path => {
    return path[0] !== "." && path !== "";
  });

  const rows: JSX.Element[] = listing.map(path => {
    const full_path = working_directory + path;
    const is_selected =
      !excluded_entries.has(full_path) &&
      (this_directory_is_selected || selected_entries.has(full_path));
    const is_directory = path[path.length - 1] === "/";
    const has_selected_descendants =
      selected_entries.filter(entry => entry.startsWith(full_path)).size > 0;
    let sub_listing;

    let box_state = Mark.empty
    if (is_selected) {
      box_state = Mark.check
    } else if (has_selected_descendants) {
      box_state = Mark.slash
    }

    if (is_directory && opened_directories.has(full_path)) {
      sub_listing = (
        <FileListing {...props} working_directory={full_path} is_root={false} />
      );
    }

    return (
      <ItemRow role={"button"} highlight={is_selected} key={path}>
        <CheckBox
          fill={box_state}
          on_click={fill => {
            if (fill == Mark.check || fill == Mark.slash) {
              on_deselect(path);
            } else {
              on_select(path);
            }
          }}
        />{" "}
        {is_directory && (
          <DirectoryToggle
            is_open={opened_directories.has(full_path)}
            on_click={_ => {
              on_click(path);
            }}
          />
        )}
        <span
          onClick={() => {
            on_click(path);
          }}
        >
          {path}
        </span>
        {sub_listing}
      </ItemRow>
    );
  });

  return (
    <ListingWrapper indent={!is_root}>
      {rows.length > 0 ? rows : <>Nothing here!</>}
    </ListingWrapper>
  );
}

const ListingWrapper = styled.div`
  margin-left: ${p => {
    return p.indent ? "15px" : "5px";
  }};
`;

function DirectoryToggle({
  is_open,
  on_click
}: {
  is_open: boolean;
  on_click: (e) => void;
}) {
  if (is_open) {
    return <span onClick={on_click}>▼ </span>;
  } else {
    return <span onClick={on_click}>► </span>;
  }
}

// Assumes included and excluded are mutually exclusive
// Returns the inclusion/exclusion status of the youngest parent
function is_implicitly_included(
  child_path: string,
  included: Set<string>,
  excluded: Set<string>
) {
  let is_selected = false;

  child_path.split("/").reduce((ancestor, folder) => {
    if (included.has(ancestor + "/")) {
      is_selected = true;
    } else if (excluded.has(ancestor + "/")) {
      is_selected = false;
    }
    return ancestor + "/" + folder;
  });

  return is_selected;
}
