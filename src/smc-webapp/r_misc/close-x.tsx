/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Icon } from "./icon";

const closex_style: React.CSSProperties = {
  float: "right",
  marginLeft: "5px",
};

export function CloseX({
  on_close,
  style,
}: {
  on_close: () => void;
  style?: React.CSSProperties;
}) {
  const onClick = (e) => {
    if (e != undefined) {
      e.preventDefault();
    }
    on_close();
  };

  return (
    <a href="" style={closex_style} onClick={onClick}>
      <Icon style={style} name="times" />
    </a>
  );
}
