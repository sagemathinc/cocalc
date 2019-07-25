import styled from "styled-components";

interface Props {
  highlight: boolean;
}

export const ItemRow = styled.div<Props>`
  cursor: pointer
  color: ${props => (props.highlight ? "ForestGreen" : "DarkSlateBlue")};
  margin: 2px;
`;
