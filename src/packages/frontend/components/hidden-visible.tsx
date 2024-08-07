/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// See https://getbootstrap.com/docs/3.3/css/

import { CSSProperties, ReactNode } from "react";

// Antd has a rule that puts an 8px margin on the left of all spans in antd buttons,
// which means that when these buttons get hidden they take up 8px of empty space
// (since the span is still there).  So for now we workaround this with an explicit style
// that cancels this out.
const STYLE = { marginLeft: 0 } as const;

interface Props {
  children?: ReactNode;
  style?: CSSProperties;
}

// HiddenXS = hide if width < 768px
export function HiddenXS({ children, style }: Props) {
  return (
    <span style={{ ...STYLE, ...style }} className={"hidden-xs"}>
      {children}
    </span>
  );
}

export function HiddenSM({ children, style }: Props) {
  return (
    <span style={{ ...STYLE, ...style }} className={"hidden-sm"}>
      {children}
    </span>
  );
}

export function HiddenXSSM({ children, style }: Props) {
  return (
    <span style={{ ...STYLE, ...style }} className={"hidden-xs hidden-sm"}>
      {children}
    </span>
  );
}

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export function VisibleMDLG({ children, style }: Props) {
  return (
    <span
      style={{ ...STYLE, ...style }}
      className={"visible-md-inline visible-lg-inline"}
    >
      {children}
    </span>
  );
}

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export function VisibleLG({ children, style }: Props) {
  return (
    <span style={{ ...STYLE, ...style }} className={"visible-lg-inline"}>
      {children}
    </span>
  );
}

export function VisibleXSSM({ children, style }: Props) {
  return (
    <span
      style={{ ...STYLE, ...style }}
      className={"visible-xs-inline visible-sm-inline"}
    >
      {children}
    </span>
  );
}

export function VisibleXS({ children, style }: Props) {
  return (
    <span style={{ ...STYLE, ...style }} className={"visible-xs-inline"}>
      {children}
    </span>
  );
}
