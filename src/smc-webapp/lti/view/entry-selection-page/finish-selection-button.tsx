import * as React from "react";
import styled from "styled-components";

interface Props {
  on_click: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function FinishSelectionButton({ disabled = false, on_click }: Props) {
  return (
    <Button onClick={disabled ? undefined : on_click} disabled={disabled}>
      Select Items
    </Button>
  );
}

const Button = styled.a`
  background: ${p => (p.disabled ? "aliceblue" : "darkSeaGreen")};
  color: ${p => (p.disabled ? "dimgray" : "white")}
  cursor: ${p => (p.disabled ? "not-allowed" : "pointer")};
  margin-bottom: 10px;
  text-decoration: none;
  text-align: center;
`;
