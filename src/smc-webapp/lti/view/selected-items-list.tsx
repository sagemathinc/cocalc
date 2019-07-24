import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";

interface Props {
  selected_entries: Set<string>;
  on_entry_removal_clicked: (path: string) => void;
}

export function SelectedItemsList({
  selected_entries,
  on_entry_removal_clicked
}: Props) {
  const entries = selected_entries.map(entry => {
    return (
      <ListItem key={entry}>
        <RemoveButton
          onClick={() => {
            on_entry_removal_clicked(entry);
          }}
        >
          X{" "}
        </RemoveButton>
        <EntryName>{entry}</EntryName>
      </ListItem>
    );
  });

  return (
    <ItemListWrapper>
      <ItemsHeader>Selected Materials</ItemsHeader>
      {entries}
    </ItemListWrapper>
  );
}

const ItemListWrapper = styled.div`
  margin: 0px 8px 8px 8px;
`;

const ItemsHeader = styled.h2`
  color: DarkSlateGrey;
`;

const ListItem = styled.div`
  display: flex;
  flex-direction: row;
`;

const EntryName = styled.span`
  flex-grow: 1;
`;

const RemoveButton = styled.span`
  color: FireBrick;
  cursor: pointer;
  margin-right: 10px;
`;
