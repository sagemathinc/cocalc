import * as React from "react";
import styled from "styled-components";
import { SubmitAssignmentButton } from "./submit-assignment-button";
import { PageTitle } from "../shared";

interface Props {
  context: { id_token: string; nonce: string; return_path: string };
}

export function ConfigurationPage({ context }: Props) {
  return (
    <ConfigurationPageContainer>
      <PageTitle>Configure your assignment</PageTitle>
      <SubmitAssignmentButton
        return_path={context.return_path}
        id_token={context.id_token}
        nonce={context.nonce}
      />
    </ConfigurationPageContainer>
  );
}

const ConfigurationPageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
