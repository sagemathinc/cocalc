import * as React from "react";
import styled from "styled-components";

interface Props {
  listing: string[];
}

export function FileListing({ listing }: Props) {
  const rows: JSX.Element[] = [];

  listing.map(path => {
    rows.push(<ItemRow key={path}>{path}</ItemRow>);
  });

  return <>{rows}</>;
}

const ItemRow = styled.div`
  color: darkslateblue;
  margin: 2px;
`;
