/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Icon } from "./icon";
import { CloseX2 } from "./close-x2";

const { Panel } = require("react-bootstrap");

interface Props {
  icon: string;
  title?: string | JSX.Element;
  show_header?: boolean;
  close?: () => void;
  children?: React.ReactNode;
}

export function SettingBox({
  icon,
  title,
  close,
  children,
  show_header = true,
}: Props) {
  function render_header() {
    if (!show_header) {
      return;
    }

    return (
      <h3>
        <Icon name={icon} /> {title}
        {close ? <CloseX2 close={close} /> : undefined}
      </h3>
    );
  }

  return <Panel header={render_header()}>{children}</Panel>;
}
