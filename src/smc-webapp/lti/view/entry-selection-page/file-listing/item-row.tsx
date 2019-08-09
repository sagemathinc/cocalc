import styled from "styled-components";
import { default_colors } from "../../values";

interface Props {
  highlight: boolean;
}

export const ItemRow = styled.div<Props>`
  cursor: pointer
  color: ${props => (props.highlight ? "SeaGreen" : `${default_colors.color}`)};
  margin: 2px;
`;
