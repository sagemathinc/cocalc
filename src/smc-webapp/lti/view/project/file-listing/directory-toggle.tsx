import * as React from "react";

interface Props {
  is_open: boolean;
  on_click: (e) => void;
}

export function DirectoryToggle({ is_open, on_click }: Props) {
  if (is_open) {
    return <span onClick={on_click}>▼ </span>;
  } else {
    return <span onClick={on_click}>► </span>;
  }
}
