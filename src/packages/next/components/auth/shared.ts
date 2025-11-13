import { CSSProperties } from "react";
import { CSS } from "../misc";

export const LOGIN_STYLE: CSSProperties = {
  border: "1px solid lightgrey",
  borderRadius: "5px",
  padding: "10px 20px 20px 20px",
  backgroundColor: "#f8f8f8",
  fontSize: "12pt",
  color: "#606060",
} as const;

export const BODY_STYLE: CSS = {
  marginTop: "18px",
  marginBottom: "18px",
  width: "100%",
} as const;

export const AUTH_WRAPPER_STYLE: CSS = {
  maxWidth: "500px",
  margin: "auto",
}
