import * as React from "react";

interface Props {
  is_open: boolean;
  on_click: (was_open: boolean) => void;
}

export function DirectoryToggle({ is_open, on_click }: Props) {
  if (is_open) {
    return <span onClick={_ => on_click(is_open)}>▼ </span>;
  } else {
    return <span onClick={_ => on_click(is_open)}>► </span>;
  }
}
