import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";

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

function CheckBox({ checked }) {
  if (checked) {
    return <>☑</>;
  } else {
    return <>☐</>;
  }
}

interface P {
  highlight: boolean;
}

const ItemRow = styled.div<P>`
  cursor: pointer
  color: ${props => (props.highlight ? "ForestGreen" : "DarkSlateBlue")};
  margin: 2px;
`;
