import * as React from "react";

interface Props {
  checked: boolean;
  on_click: (checked: boolean) => void;
}

export function CheckBox({ checked, on_click }: Props) {
  if (checked) {
    return <span onClick={() => on_click(checked)}>☑</span>;
  } else {
    return <span onClick={() => on_click(checked)}>☐</span>;
  }
}
