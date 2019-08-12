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
