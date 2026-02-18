/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Icon } from "./icon";

const closex_style: React.CSSProperties = {
  float: "right",
  marginLeft: "5px",
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} as const;

interface Props {
  on_close: () => void;
  style?: React.CSSProperties;
}

export const CloseX: React.FC<Props> = (props: Props) => {
  const { on_close, style } = props;

  function onClick(e) {
    e?.preventDefault();
    on_close();
  }

  return (
    <button
      type="button"
      style={{ ...closex_style, ...style }}
      onClick={onClick}
      aria-label="Close"
    >
      <Icon name="times" />
    </button>
  );
};
