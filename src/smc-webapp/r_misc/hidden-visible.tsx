/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// See https://getbootstrap.com/docs/3.3/css/

import { React } from "../app-framework";

// HiddenXS = hide if width < 768px
export const HiddenXS: React.FC = ({ children }) => {
  return <span className={"hidden-xs"}>{children}</span>;
};

export const HiddenSM: React.FC = ({ children }) => {
  return <span className={"hidden-sm"}>{children}</span>;
};

export const HiddenXSSM: React.FC = ({ children }) => {
  return <span className={"hidden-xs hidden-sm"}>{children}</span>;
};

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export const VisibleMDLG: React.FC = ({ children }) => {
  return (
    <span className={"visible-md-inline visible-lg-inline"}>{children}</span>
  );
};

// VisibleMDLG = visible on medium or large devices (anything with width > 992px)
export const VisibleLG: React.FC = ({ children }) => {
  return <span className={"visible-lg-inline"}>{children}</span>;
};

export const VisibleXSSM: React.FC = ({ children }) => {
  return (
    <span className={"visible-xs-inline visible-sm-inline"}>{children}</span>
  );
};
