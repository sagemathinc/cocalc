import * as React from "react";
import styled from "styled-components";
import { PageTitle } from "../shared";
import { SubmitAssignmentButton } from "./submit-assignment-button";
import { NameAssignment } from "./name-assignment";

interface Props {
  context: { id_token: string; nonce: string; return_path: string };
}

export function ConfigurationPage({ context }: Props) {
  return (
    <ConfigurationPageContainer>
      <PageTitle>Configure your assignment</PageTitle>
      <NameAssignment default_name={undefined} />
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
