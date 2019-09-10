import * as React from "react";
import { COLORS, Tip } from "../../r_misc";

const Breadcrumb = require("react-bootstrap");

interface Props {
  path?: string;
  display?: string | JSX.Element;
  actions: any;
  full_name?: string;
  history?: boolean;
  active?: boolean;
}

// One segment of the directory links at the top of the files listing.
export function PathSegmentLink({
  path,
  display,
  actions,
  full_name,
  history,
  active = false
}: Props) {

  function handle_click() {
    return actions.open_directory(path);
  }

  function render_content() {
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

  function style() {
    if (history) {
      return { color: "#c0c0c0" };
    } else if (active) {
      return { color: COLORS.BS_BLUE_BGRND };
    }
    return {};
  }

  return (
    <Breadcrumb.Item
      onClick={handle_click}
      active={active}
      style={style()}
    >
      {render_content()}
    </Breadcrumb.Item>
  );
}
