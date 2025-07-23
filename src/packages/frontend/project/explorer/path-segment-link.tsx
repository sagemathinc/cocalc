/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { CSS } from "@cocalc/frontend/app-framework";

interface Props {
  path: string;
  display?: string | React.JSX.Element;
  on_click: (path: string) => void;
  full_name?: string;
  history?: boolean;
  active?: boolean;
  key: number;
  style?: CSS;
}

export interface PathSegmentItem {
  key: number;
  title: React.JSX.Element | string | undefined;
  onClick: () => void;
  className: string;
  style?: CSS;
}

// One segment of the directory links at the top of the files listing.
export function createPathSegmentLink(props: Readonly<Props>): PathSegmentItem {
  const {
    path = "",
    display,
    on_click,
    full_name,
    history,
    active = false,
    key,
    style,
  } = props;

  function render_content(): React.JSX.Element | string | undefined {
    if (full_name && full_name !== display) {
      return (
        <Tooltip title={full_name} placement="bottom">
          {display}
        </Tooltip>
      );
    } else {
      return display;
    }
  }

  function cls() {
    if (history) {
      return "cc-path-navigator-history";
    } else if (active) {
      return "cc-path-navigator-active";
    } else {
      return "cc-path-navigator-basic";
    }
  }

  return {
    onClick: () => on_click(path),
    className: cls(),
    key,
    title: render_content(),
    style,
  };
}
