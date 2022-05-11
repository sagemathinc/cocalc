/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tip } from "@cocalc/frontend/components";
import { Breadcrumb } from "antd";

interface Props {
  path: string;
  display?: string | JSX.Element;
  on_click: (path: string) => void;
  full_name?: string;
  history?: boolean;
  active?: boolean;
  key: number;
}

// One segment of the directory links at the top of the files listing.
// this can't be a react component, because "Breadcrumb" only works with Breadcrumb.Item children!
export function PathSegmentLink(props: Props) {
  const {
    path = "",
    display,
    on_click,
    full_name,
    history,
    active = false,
    key,
  } = props;

  function render_content(): JSX.Element | string | undefined {
    if (full_name && full_name !== display) {
      return (
        <Tip tip={full_name} placement="bottom" title="Full name">
          {display}
        </Tip>
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

  return (
    <Breadcrumb.Item onClick={() => on_click(path)} className={cls()} key={key}>
      {render_content()}
    </Breadcrumb.Item>
  );
}
