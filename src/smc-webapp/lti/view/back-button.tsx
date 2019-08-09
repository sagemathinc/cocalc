import * as React from "react";
import styled from "styled-components";

interface Props {
  on_click: (e: React.MouseEvent) => void;
}

export function BackButton({ on_click }: Props) {
  return <Button onClick={on_click}>{"<"}</Button>;
}

const Button = styled.button`
  border: none;
  cursor: pointer;
  font-size: 36px;
`;
