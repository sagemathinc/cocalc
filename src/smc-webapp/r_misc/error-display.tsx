/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import * as misc from "smc-util/misc";
import { Icon } from "./index";
import { Alert, Button } from "antd";

// use "style" to customize
const ELEMENT_STYLE: React.CSSProperties = {
  overflowY: "auto",
} as const;

// use "body_style" prop to customize
const BODY_STYLE: React.CSSProperties = {
  marginRight: "10px",
  whiteSpace: "pre-wrap",
  fontSize: "85%",
} as const;

const CLOSE_X: React.CSSProperties = {
  float: "right",
  position: "absolute",
  top: "5px",
  right: "10px",
  zIndex: 1,
} as const;

interface Props {
  error?: string | object;
  error_component?: JSX.Element | JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
  body_style?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
  banner?: boolean;
}

export const ErrorDisplay: React.FC<Props> = React.memo((props: Props) => {
  const {
    error,
    error_component,
    title,
    body_style,
    style,
    bsStyle,
    onClose,
    banner = false,
  } = props;

  function render_title() {
    return <h4>{title}</h4>;
  }

  function render_error() {
    if (error != undefined) {
      if (typeof error === "string") {
        return error;
      } else {
        return misc.to_json(error);
      }
    } else {
      return error_component;
    }
  }

  function type(): string {
    if (
      // only types that antd has...
      bsStyle != null &&
      ["success", "info", "warning", "error"].includes(bsStyle)
    ) {
      return bsStyle;
    } else {
      return "error";
    }
  }

  function msgdesc() {
    if (title) {
      return [
        render_title(),
        <div style={{ ...BODY_STYLE, ...body_style }}>{render_error()}</div>,
      ];
    } else {
      return [
        <div style={{ ...BODY_STYLE, ...body_style }}>{render_error()}</div>,
        undefined,
      ];
    }
  }

  // must be rendered as the first child element!
  function render_close() {
    if (onClose == null || banner === false) return;
    return (
      <Button
        style={CLOSE_X}
        shape="circle"
        size="small"
        type="text"
        onClick={onClose}
      >
        <Icon style={style} name="times" />
      </Button>
    );
  }

  function render_alert() {
    const [message, description] = msgdesc();
    // tweak the case where it's not a banner
    const extra = banner ? undefined : { closable: true, onClose };
    return (
      <Alert
        banner={banner}
        showIcon={false}
        style={{ ...ELEMENT_STYLE, ...style }}
        type={type() as any}
        message={message}
        description={description}
        {...extra}
      />
    );
  }

  const divprops = banner ? { className: "cc-error-display" } : undefined;

  return (
    <div {...divprops}>
      {render_close()}
      {render_alert()}
    </div>
  );
});
