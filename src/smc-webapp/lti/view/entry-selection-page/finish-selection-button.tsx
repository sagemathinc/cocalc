import * as React from "react";
import styled from "styled-components";

interface Props {
  on_click: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function FinishSelectionButton({ disabled = false, on_click }: Props) {
  return (
    <Button onClick={on_click} disabled={disabled}>
      Select Items
    </Button>
  );
}

const Button = styled.button`
  background: ${p => (p.disabled ? "aliceblue" : "darkSeaGreen")};
  color: ${p => (p.disabled ? "dimgray" : "white")}
  cursor: ${p => (p.disabled ? "not-allowed" : "pointer")};
  font-size: 24px;
  margin-bottom: 10px;
  text-align: center;
`;
