import styled from "styled-components";

export const Button = styled.button`
  background: ${p => (p.disabled ? "aliceblue" : "seaGreen")};
  color: ${p => (p.disabled ? "dimgray" : "white")}
  cursor: ${p => (p.disabled ? "not-allowed" : "pointer")};
  font-size: 24px;
  margin-bottom: 10px;
  text-align: center;
`;
