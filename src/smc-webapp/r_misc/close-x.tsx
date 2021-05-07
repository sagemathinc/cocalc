/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Icon } from "./icon";

const closex_style: React.CSSProperties = {
  float: "right",
  marginLeft: "5px",
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
    <a href="" style={closex_style} onClick={onClick}>
      <Icon style={style} name="times" />
    </a>
  );
};
