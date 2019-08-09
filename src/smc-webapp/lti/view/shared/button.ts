import styled from "styled-components";

export const Button = styled.button`
  background: ${p => (p.disabled ? "aliceblue" : "seaGreen")};
  color: ${p => (p.disabled ? "dimgray" : "white")}
  cursor: ${p => (p.disabled ? "not-allowed" : "pointer")};
  font-size: 1.5rem;
  margin-bottom: .6rem;
  text-align: center;
`;
