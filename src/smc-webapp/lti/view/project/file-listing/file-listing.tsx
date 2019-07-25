import * as React from "react";
import { Set } from "immutable";

import { ItemRow } from "./item-row";
import { CheckBox } from "./check-box";

interface Props {
  listing: string[];
  selected_entries: Set<string>;
  on_click: (path: string) => void;
}

export function FileListing({ listing, selected_entries, on_click }: Props) {
  const rows: JSX.Element[] = [];

  listing.map(path => {
    const is_selected = selected_entries.has(path);
    rows.push(
      <ItemRow
        onClick={() => {
          on_click(path);
        }}
        role={"button"}
        highlight={is_selected}
        key={path}
      >
        <CheckBox checked={is_selected} />
        {path}
      </ItemRow>
    );
  });

  return <>{rows}</>;
}
