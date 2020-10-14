/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this thin wrapper is used by hub/share server, because using the frontend Tip fails with Antd

import * as React from "react";

interface Props {
  style?: React.CSSProperties; // changing not checked when updating if stable is true
  children?: React.ReactNode;
}

export const Tip: React.FC<Props> = (props: Props) => {
  return <span style={props.style}>{props.children}</span>;
};
