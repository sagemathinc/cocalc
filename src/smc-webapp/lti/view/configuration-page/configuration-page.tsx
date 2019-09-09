import * as React from "react";
import styled from "styled-components";
import { PageTitle } from "../shared";
import { SubmitAssignmentButton } from "./submit-assignment-button";
import { AssignmentNameInput } from "./assignment-name-input";
import { Set } from "immutable";

interface Props {
  selected_project: string;
  selected_entries: Set<string>;
  excluded_entries: Set<string>;
  context: { id_token: string; nonce: string; return_path: string };
}

export function ConfigurationPage({
  selected_project,
  selected_entries,
  excluded_entries,
  context
}: Props) {
  return (
    <ConfigurationPageContainer>
      <PageTitle>Configure your assignment</PageTitle>
      <form method="post" action={context.return_path}>
        <AssignmentNameInput name="assignment_name" placeholder={"Undefined"} />
        <SubmitAssignmentButton
          project_id={selected_project}
          selected_paths={selected_entries.toArray()}
          excluded_paths={excluded_entries.toArray()}
          id_token={context.id_token}
          nonce={context.nonce}
        />
      </form>
    </ConfigurationPageContainer>
  );
}

const ConfigurationPageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
