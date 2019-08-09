import * as React from "react";
import styled from "styled-components";
import { default_colors } from "./values";

interface Props {
  on_click: (e: React.MouseEvent) => void;
}

export function BackButton({ on_click }: Props) {
  return <Button onClick={on_click}>{"<"}</Button>;
}

const Button = styled.a`
  background-color: ${default_colors.background_color};
  border: none;
  cursor: pointer;
  font-size: 36px;
  text-decoration: none;
  text-align: center;
`;
