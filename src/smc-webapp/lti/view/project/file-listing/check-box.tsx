import * as React from "react";
import { assert_never } from "../../../helpers";

export enum Mark {
  check,
  slash,
  empty
}

interface Props {
  fill: Mark;
  on_click: (fill: Mark) => void;
}

export function CheckBox({ fill, on_click }: Props) {
  switch (fill) {
    case Mark.check:
      return <span onClick={() => on_click(fill)}>☑</span>;
    case Mark.slash:
      return <span onClick={() => on_click(fill)}>⧅</span>;
    case Mark.empty:
      return <span onClick={() => on_click(fill)}>☐</span>;
    default:
      return assert_never(fill);
  }
}
