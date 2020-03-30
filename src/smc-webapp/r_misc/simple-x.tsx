import * as React from "react";
import { Icon } from "./icon";

interface Props {
  onClick: () => void;
}

export function SimpleX({ onClick }: Props) {
  return (
    <a
      href=""
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <Icon name="times" />
    </a>
  );
}
