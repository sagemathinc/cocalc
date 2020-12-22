/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Rendered, CSS } from "smc-webapp/app-framework";
import { Icon } from "./icon";
import * as misc from "smc-util/misc";
import * as feature from "../feature";
import { Tooltip, Popover } from "antd";
import { TooltipPlacement } from "antd/es/tooltip";

const TIP_STYLE: CSS = {
  wordWrap: "break-word",
  maxWidth: "250px",
};

type Size = "xsmall" | "small" | "medium" | "large";

type Trigger = "hover" | "focus" | "click" | "contextMenu";

interface Props {
  title: string | JSX.Element | JSX.Element[]; // not checked for update
  placement?: TooltipPlacement;
  tip?: string | JSX.Element | JSX.Element[]; // not checked for update
  size?: Size; // IMPORTANT: this is currently ignored -- see https://github.com/sagemathinc/cocalc/pull/4155
  delayShow?: number;
  delayHide?: number;
  rootClose?: boolean;
  icon?: string;
  id?: string; // can be used for screen readers
  style?: CSS; // changing not checked when updating if stable is true
  popover_style?: CSS; // changing not checked ever (default={zIndex:1000})
  stable?: boolean; // if true, children assumed to never change
  allow_touch?: boolean;
  trigger?: Trigger | Trigger[];
  children?: React.ReactNode;
  tip_style?: CSS;
}

function is_equal(prev, next) {
  if (prev.stable) {
    return true;
  } else {
    return misc.is_different(prev, next, [
      "placement",
      "size",
      "delayShow",
      "delayHide",
      "rootClose",
      "icon",
      "id",
    ]);
  }
}

export const Tip: React.FC<Props> = React.memo((props: Props) => {
  const {
    placement = "right",
    delayShow = 500, // [ms]
    delayHide = 100, // [ms] this was 0 before switching to Antd – which has 100ms as its default, though.
    // rootClose = false,
    popover_style = { zIndex: 1000 },
    allow_touch = false,
    // id = "tip",
    title,
    tip,
    // size,
    icon,
    style,
    trigger,
    children,
    tip_style,
  } = props;

  function render_title() {
    if (!icon) return title;
    return (
      <span>
        <Icon name={icon} /> {title}
      </span>
    );
  }

  // a tip is rendered in a description box below the title
  function render_tip(): Rendered {
    const style = { ...TIP_STYLE, ...tip_style };
    return <div style={style}>{tip}</div>;
  }

  // this is the visible element, which gets some information
  function render_wrapped() {
    return <span style={style}>{children}</span>;
  }

  function get_scale(): React.CSSProperties | undefined {
    return;
    // I'm disabling this since I don't think it's that useful,
    // and this does not work at all.  Plus our current react-bootstrap
    // tip implementation is horribly broken.
    /*
    if (size == null) return;
    switch (size) {
      case "xsmall":
        return { transform: "scale(0.75)" };
      case "small":
        return { transform: "scale(0.9)" };
      case "medium":
        return;
      case "large":
        return { transform: "scale(1.2)" };
      default:
        unreachable(size);
    }
    */
  }

  function render_tooltip() {
    if (delayShow == null || delayHide == null) return null;

    const props: { [key: string]: any } = {
      arrowPointAtCenter: true,
      placement: placement,
      trigger: trigger ?? "hover",
      mouseEnterDelay: delayShow / 1000,
      mouseLeaveDelay: delayHide / 1000,
    };

    props.overlayStyle = Object.assign({}, popover_style, get_scale());

    if (tip) {
      return (
        <Popover title={render_title()} content={render_tip()} {...props}>
          {render_wrapped()}
        </Popover>
      );
    } else {
      return (
        <Tooltip title={render_title()} {...props}>
          {render_wrapped()}
        </Tooltip>
      );
    }
  }

  // Tooltips are very frustrating and pointless on mobile or tablets, and cause a lot of trouble; also,
  // our assumption is that mobile users will also use the desktop version at some point, where
  // they can learn what the tooltips say.  We do optionally allow a way to use them.
  if (feature.IS_TOUCH && !allow_touch) {
    return render_wrapped();
  } else {
    return render_tooltip();
  }
}, is_equal);
