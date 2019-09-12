import * as React from "react";
import { COLORS, Tip } from "../../r_misc";

const Breadcrumb = require("react-bootstrap");

interface Props {
  path: string;
  display?: string | JSX.Element;
  on_click: (path: string) => void;
  full_name?: string;
  history?: boolean;
  active?: boolean;
}

// One segment of the directory links at the top of the files listing.
export function PathSegmentLink({
  path = "",
  display,
  on_click,
  full_name,
  history,
  active = false
}: Props): JSX.Element {
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

  function style(): React.CSSProperties{
    if (history) {
      return { color: "#c0c0c0" };
    } else if (active) {
      return { color: COLORS.BS_BLUE_BGRND };
    }
    return {};
  }

  return (
    <Breadcrumb.Item
      onClick={() => on_click(path)}
      active={active}
      style={style()}
    >
      {render_content()}
    </Breadcrumb.Item>
  );
}
