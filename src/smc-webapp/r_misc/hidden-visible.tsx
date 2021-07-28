/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// See https://getbootstrap.com/docs/3.3/css/

import { React } from "../app-framework";

// Antd has a rule that puts an 8px margin on the left of all spans in antd buttons,
// which means that when these buttons get hidden they take up 8px of empty space
// (since the span is still there).  So for now we workaround this with an explicit style
// that cancels this out.
const style = { marginLeft: 0 };

// HiddenXS = hide if width < 768px
export const HiddenXS: React.FC = ({ children }) => {
  return (
    <span style={style} className={"hidden-xs"}>
      {children}
    </span>
  );
};

export const HiddenSM: React.FC = ({ children }) => {
  return (
    <span style={style} className={"hidden-sm"}>
      {children}
    </span>
  );
};

export const HiddenXSSM: React.FC = ({ children }) => {
  return (
    <span style={style} className={"hidden-xs hidden-sm"}>
      {children}
    </span>
  );
};

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export const VisibleMDLG: React.FC = ({ children }) => {
  return (
    <span style={style} className={"visible-md-inline visible-lg-inline"}>
      {children}
    </span>
  );
};

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export const VisibleLG: React.FC = ({ children }) => {
  return (
    <span style={style} className={"visible-lg-inline"}>
      {children}
    </span>
  );
};

export const VisibleXSSM: React.FC = ({ children }) => {
  return (
    <span style={style} className={"visible-xs-inline visible-sm-inline"}>
      {children}
    </span>
  );
};
