import * as React from "react";
import styled from "styled-components";
import { PageTitle } from "../shared";
import { SubmitAssignmentButton } from "./submit-assignment-button";
import { AssignmentNameInput } from "./assignment-name-input";

interface Props {
  context: { id_token: string; nonce: string; return_path: string };
}

export function ConfigurationPage({ context }: Props) {
  return (
    <ConfigurationPageContainer>
      <PageTitle>Configure your assignment</PageTitle>
      <form method="post" action={context.return_path}>
        <AssignmentNameInput name="assignment_name" placeholder={"Undefined"} />
        <input
          type={"hidden"}
          name={"url"}
          value={
            "https://cocalc.com/projects/369491f1-9b8a-431c-8cd0-150dd15f7b11/files/work/2019-06-19.sage-chat?"
          }
        />
        <SubmitAssignmentButton
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
