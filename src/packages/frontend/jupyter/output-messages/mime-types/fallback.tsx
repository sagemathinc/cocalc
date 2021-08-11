import React from "react";
import { STDERR_STYLE } from "../style";

export default function FallbackHandler({ type }) {
  return <div style={STDERR_STYLE}>MIME type {type} not supported</div>;
}
