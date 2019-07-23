import * as React from "react";
import styled from "styled-components";

interface Props {
  listing: string[];
  on_click: (path: string) => void;
}

export function FileListing({ listing, on_click }: Props) {
  const rows: JSX.Element[] = [];

  listing.map(path => {
    rows.push(
      <ItemRow
        onClick={() => {
          on_click(path);
        }}
        role={"button"}
        key={path}
      >
        {path}
      </ItemRow>
    );
  });

  return <>{rows}</>;
}

const ItemRow = styled.div`
  cursor: pointer
  color: darkslateblue;
  margin: 2px;
`;
