import * as React from "react";
import styled from "styled-components";
import { Set } from "immutable";
import { Projects } from "../state/types";

interface Props {
  selected_entries: { [key: string]: Set<string> };
  on_entry_removal_clicked: (path: string, project_id: string) => void;
  projects: Projects;
}

export function SelectedItemsList({
  selected_entries,
  on_entry_removal_clicked,
  projects
}: Props) {
  const project_items = Object.entries(selected_entries).map(
    ([project_id, paths]) => {
      const entries = paths.map(path => {
        return (
          <ListItem key={path}>
            <RemoveButton
              onClick={() => {
                on_entry_removal_clicked(path, project_id);
              }}
            >
              X{" "}
            </RemoveButton>
            <EntryName>{path}</EntryName>
          </ListItem>
        );
      });

      if (entries.size == 0) {
        return undefined;
      }

      return (
        <ItemListWrapper key={project_id}>
          <ProjectHeader>{projects[project_id].title}</ProjectHeader>
          {entries}
        </ItemListWrapper>
      );
    }
  );

  return (
    <ItemListWrapper>
      <ItemsHeader>Selected Materials</ItemsHeader>
      {project_items.length > 0 ? project_items : <>Nothing selected yet!</>}
    </ItemListWrapper>
  );
}

const ItemListWrapper = styled.div`
  margin: 0rem 0.5rem 0.5rem 0.5rem;
`;

const ItemsHeader = styled.h2`
  color: DarkSlateGrey;
`;

const ProjectHeader = styled.h3`
  color: LightSlateGrey;
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
