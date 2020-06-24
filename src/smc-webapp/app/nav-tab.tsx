/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions } from "../app-framework";
import { NavItem } from "react-bootstrap";
import { user_tracking } from "../user-tracking";
import { Icon } from "../r_misc";
import { COLORS } from "smc-util/theme";

const ACTIVE_BG_COLOR = COLORS.TOP_BAR.ACTIVE;

interface Props {
  name?: string;
  label?: string | JSX.Element;
  label_class?: string;
  icon?: string | JSX.Element;
  close?: boolean;
  on_click?: () => void;
  active_top_tab?: string;
  style?: React.CSSProperties;
  inner_style?: React.CSSProperties;
  add_inner_style?: React.CSSProperties;
  hide_label?: boolean;
  is_project?: boolean;
}

export const NavTab: React.FC<Props> = React.memo((props) => {
  const page_actions = useActions("page");

  function render_label() {
    if (!props.hide_label && props.label != null) {
      return (
        <span
          style={{ marginLeft: 5 }}
          className={props.label_class}
          cocalc-test={props.name}
        >
          {props.label}
        </span>
      );
    }
  }

  function render_icon() {
    if (props.icon != null) {
      if (typeof props.icon === "string") {
        return <Icon name={props.icon} style={{ paddingRight: 2 }} />;
      } else {
        return props.icon;
      }
    }
  }

  function onClick(_) {
    props.on_click?.();

    if (props.is_project) {
      user_tracking("top_nav", {
        name: "project",
        project_id: props.name,
      });
    } else {
      user_tracking("top_nav", {
        name: props.name ?? props.label,
      });
    }

    if (props.name != null) {
      page_actions.set_active_tab(props.name);
    }
  }

  let inner_style: React.CSSProperties, outer_style: React.CSSProperties;
  const is_active = props.active_top_tab === props.name;

  if (props.style != null) {
    outer_style = props.style;
  } else {
    outer_style = {};
  }

  outer_style.float = "left";

  if (outer_style.fontSize == null) {
    outer_style.fontSize = "14px";
  }
  if (outer_style.cursor == null) {
    outer_style.cursor = "pointer";
  }
  outer_style.border = "none";

  if (is_active) {
    outer_style.backgroundColor = ACTIVE_BG_COLOR;
  }

  if (props.inner_style) {
    ({ inner_style } = props);
  } else {
    inner_style = { padding: "10px" };
  }
  if (props.add_inner_style) {
    inner_style = { ...inner_style, ...props.add_inner_style };
  }

  return (
    <NavItem active={is_active} onClick={onClick} style={outer_style}>
      <div style={inner_style}>
        {render_icon()}
        {render_label()}
        {props.children}
      </div>
    </NavItem>
  );
});
