import * as React from "react";
import { Set } from "immutable";
import styled from "styled-components";

import { ItemRow } from "./item-row";
import { CheckBox, Mark } from "./check-box";
import { DirectoryToggle } from "./directory-toggle";
import { is_implicitly_included } from "./helpers";

interface Props {
  working_directory: string;
  file_listings: { [key: string]: string[] }; // Path: Children[]
  opened_directories: Set<string>;
  selected_entries: Set<string>;
  excluded_entries: Set<string>;
  on_select: (path: string) => void;
  on_deselect: (path: string) => void;
  on_file_click: (path: string, is_checked: boolean) => void;
  on_directory_click: (path: string, is_open: boolean) => void;
  is_root?: boolean;
}

// Recursively renders a directory listing and any opened sub-directories
export function FileListing(props: Props) {
  const {
    working_directory,
    file_listings,
    opened_directories,
    selected_entries,
    excluded_entries,
    on_select,
    on_deselect,
    on_file_click,
    on_directory_click,
    is_root = true
  } = props;

  if (!file_listings || !file_listings[working_directory]) {
    return <ListingWrapper indent={!is_root}>Loading...</ListingWrapper>;
  }

  let working_directory_is_selected = is_implicitly_included(
    working_directory,
    selected_entries,
    excluded_entries
  );

  const rows: JSX.Element[] = file_listings[working_directory].map(
    item_name => {
      const path = working_directory + item_name;
      const is_directory = path[path.length - 1] === "/";
      const is_open = is_directory && opened_directories.has(path);
      const is_selected =
        !excluded_entries.has(path) &&
        (working_directory_is_selected || selected_entries.has(path));
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
              on_click={was_open => {
                on_directory_click(path, was_open);
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
          {is_open && (
            <FileListing {...props} working_directory={path} is_root={false} />
          )}
        </ItemRow>
      );
    }
  );

  return (
    <ListingWrapper indent={!is_root}>
      {rows.length > 0 ? rows : <>Nothing here!</>}
    </ListingWrapper>
  );
}

const ListingWrapper = styled.div`
  margin-left: ${p => {
    return p.indent ? "1rem" : "0rem";
  }};
  overflow: scroll;
`;
