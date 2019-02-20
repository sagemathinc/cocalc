import * as React from "react";
import { SimpleX } from "./simple-x";

interface Props {
  error_text: string;
  on_close: (e: React.SyntheticEvent) => void;
}

export function skinnyError({ error_text, on_close }: Props) {
  <div style={{ color: "red" }}>
    <SimpleX onClick={on_close} /> {error_text}
  </div>;
}
