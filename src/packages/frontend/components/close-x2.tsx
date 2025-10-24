/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { CSS } from "@cocalc/frontend/app-framework";
import { Icon } from "./icon";

interface Props {
  style?: React.CSSProperties;
  close?: () => void;
}

const DEFAULT_STYLE: CSS = {
  cursor: "pointer",
  fontSize: "13pt",
  border: "none",
  background: "transparent",
  padding: 0,
};

function isSame(prev, next) {
  if (prev == null || next == null) {
    return false;
  }
  return prev.close != next.close;
}

export const CloseX2: React.FC<Props> = React.memo((props: Props) => {
  const { close = undefined, style = DEFAULT_STYLE } = props;

  if (!close) {
    return null;
  } else {
    return (
      <button
        type="button"
        className={"pull-right lighten"}
        style={style}
        onClick={close}
        aria-label="Close"
      >
        <Icon name={"times"} />
      </button>
    );
  }
}, isSame);
