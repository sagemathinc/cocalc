/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { CSS, React, useActions } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import { TOP_BAR_ELEMENT_CLASS } from "./top-nav-consts";

const ACTIVE_BG_COLOR = COLORS.TOP_BAR.ACTIVE;

interface Props {
  //close?: boolean;
  active_top_tab?: string;
  add_inner_style?: CSS;
  children?: React.ReactNode;
  hide_label?: boolean;
  icon?: IconName | JSX.Element;
  is_project?: boolean;
  label_class?: string;
  label?: string | JSX.Element;
  name?: string;
  on_click?: () => void;
  style?: CSS;
  tooltip?: string;
}

export const NavTab: React.FC<Props> = React.memo((props: Props) => {
  const {
    //close,
    active_top_tab,
    add_inner_style = {},
    children,
    hide_label,
    icon,
    is_project,
    label_class,
    label,
    name,
    on_click,
    style = {},
    tooltip,
  } = props;
  const page_actions = useActions("page");

  function render_label() {
    if (!hide_label && label != null) {
      return (
        <span
          style={icon != null ? { marginLeft: "5px" } : undefined}
          className={label_class}
          cocalc-test={name}
        >
          {label}
        </span>
      );
    }
  }

  function render_icon() {
    if (icon != null) {
      if (typeof icon === "string") {
        return <Icon name={icon} style={{ fontSize: "20px" }} />;
      } else {
        return icon;
      }
    }
  }

  function onClick() {
    on_click?.();

    if (is_project) {
      track("top_nav", {
        name: "project",
        project_id: name,
      });
    } else {
      track("top_nav", {
        name: name ?? label,
      });
    }

    if (name != null) {
      page_actions.set_active_tab(name);
    }
  }

  const is_active = active_top_tab === name;

  const outer_style: CSS = {
    fontSize: "14px",
    cursor: "pointer",
    float: "left",
    flex: "0 0 auto",
    display: "flex",
    border: "none",
    ...style,
    ...(is_active && { backgroundColor: ACTIVE_BG_COLOR }),
  };

  const inner_style: CSS = {
    padding: "12px",
    display: "flex",
    flexDirection: "row",
    verticalAlign: "middle",
    alignItems: "center",
    whiteSpace: "nowrap",
    ...add_inner_style,
  };

  function renderInner(): JSX.Element {
    const inner = (
      <div style={inner_style}>
        {render_icon()}
        {render_label()}
        {children}
      </div>
    );
    if (tooltip != null) {
      return (
        <Tooltip
          title={tooltip}
          mouseEnterDelay={1}
          mouseLeaveDelay={0}
          placement="bottom"
        >
          {inner}
        </Tooltip>
      );
    } else {
      return inner;
    }
  }

  return (
    <div
      onClick={onClick}
      style={outer_style}
      className={TOP_BAR_ELEMENT_CLASS}
    >
      {renderInner()}
    </div>
  );
});
