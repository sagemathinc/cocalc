import * as React from "react";
import styled from "styled-components";
import { default_colors } from "./values";

interface Props {
  on_click: (e: React.MouseEvent) => void;
}

export function BackButton({ on_click }: Props) {
  return <Button onClick={on_click}>{"<"}</Button>;
}

const Button = styled.button`
  background-color: ${default_colors.background_color};
  border: none;
  cursor: pointer;
  font-size: 2.5rem;
  text-align: center;
`;
