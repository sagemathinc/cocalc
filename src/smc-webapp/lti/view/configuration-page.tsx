import * as React from "react";
import styled from "styled-components";
import { ReturnButton } from "./return-button";

interface Props {
  context: { id_token: string; nonce: string; return_path: string };
}

export function ConfigurationPage({ context }: Props) {
  return (
    <ConfigurationPageContainer>
      <ReturnButton
        return_path={context.return_path}
        id_token={context.id_token}
        nonce={context.nonce}
      />
    </ConfigurationPageContainer>
  );
}

const ConfigurationPageContainer = styled.div``;
