import * as React from "react";
import { Set } from "immutable";

import { ItemRow } from "./item-row";
import { CheckBox } from "./check-box";

interface Props {
  listing: string[];
  current_directory: string;
  selected_entries: Set<string>;
  on_path_click: (path: string) => void;
  on_select: (path: string) => void;
  on_deselect: (path: string) => void;
}

export function FileListing({
  listing,
  current_directory,
  selected_entries,
  on_path_click,
  on_select,
  on_deselect
}: Props) {
  const rows: JSX.Element[] = listing.map(path => {
    const is_selected = selected_entries.has(current_directory + path);
    return (
      <ItemRow role={"button"} highlight={is_selected} key={path}>
        <CheckBox
          checked={is_selected}
          on_click={checked => {
            if (checked) {
              on_deselect(path);
            } else {
              on_select(path);
            }
          }}
        />{" "}
        <span
          onClick={() => {
            on_path_click(path);
          }}
        >
          {path}
        </span>
      </ItemRow>
    );
  });

  return <>{rows.length > 0 ? rows : <>Nothing here!</>}</>;
}
