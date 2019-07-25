import * as React from "react";

interface Props {
  checked: boolean;
}

export function CheckBox({ checked }: Props) {
  if (checked) {
    return <>☑</>;
  } else {
    return <>☐</>;
  }
}
