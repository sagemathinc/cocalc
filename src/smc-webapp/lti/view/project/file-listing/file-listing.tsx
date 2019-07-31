import * as React from "react";
import { Set } from "immutable";
import styled from "styled-components";

import * as API from "../../../api";
import { Action } from "../../../state/types";
import { ItemRow } from "./item-row";
import { CheckBox, Mark } from "./check-box";
import { DirectoryToggle } from "./directory-toggle";

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

  if (!file_listings || !file_listings[working_directory]) {
    return <ListingWrapper indent={!is_root}>Loading...</ListingWrapper>;
  }

  let this_directory_is_selected = is_implicitly_included(
    working_directory,
    selected_entries,
    excluded_entries
  );

  const on_select = path => {
    dispatch({
      type: "add_entry",
      project_id,
      path
    });
  };

  const on_deselect = path => {
    dispatch({
      type: "remove_entry",
      project_id,
      path
    });
  };

  const on_file_click = (path: string, is_checked) => {
    if (is_checked) {
      on_deselect(path);
    } else {
      on_select(path);
    }
  };

  const on_directory_click = (path: string, is_open: boolean) => {
    if (is_open) {
      dispatch({ type: "close_directory", path: path, project_id });
    } else {
      dispatch({ type: "open_directory", path: path, project_id });
      API.fetch_directory_listing(project_id, path, dispatch);
    }
  };

  // Filter out hidden items
  const listing = file_listings[working_directory].filter(item_name => {
    return item_name[0] !== "." && item_name !== "";
  });

  const rows: JSX.Element[] = listing.map(item_name => {
    const path = working_directory + item_name;
    const is_directory = path[path.length - 1] === "/";
    const is_open = opened_directories.has(path);
    const is_selected =
      !excluded_entries.has(path) &&
      (this_directory_is_selected || selected_entries.has(path));
    const has_selected_descendants =
      selected_entries.filter(entry => entry.startsWith(path)).size > 0;

    let box_state = Mark.empty;
    if (is_selected) {
      box_state = Mark.check;
    } else if (has_selected_descendants) {
      box_state = Mark.slash;
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
            is_open={is_open}
            on_click={_ => {
              on_directory_click(path, is_open);
            }}
          />
        )}
        <span
          onClick={() => {
            if (is_directory) {
              on_directory_click(path, is_open);
            } else {
              on_file_click(path, is_selected);
            }
          }}
        >
          {item_name}
        </span>
        {is_directory && opened_directories.has(path) && (
          <FileListing {...props} working_directory={path} is_root={false} />
        )}
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
