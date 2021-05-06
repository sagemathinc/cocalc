/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import * as misc from "smc-util/misc";
import { Icon } from "./index";
import { Alert, Button } from "antd";

// use "element_style" to customize
const ELEMENT_STYLE: React.CSSProperties = {
  overflowY: "auto",
} as const;

// use "style" prop to customize
const BODY_STYLE: React.CSSProperties = {
  marginRight: "10px",
  whiteSpace: "pre",
  fontSize: "85%",
} as const;

const CLOSE_X: React.CSSProperties = {
  float: "right",
  position: "absolute",
  top: "5px",
  right: "10px",
  zIndex: 1,
} as const;

const WRAPPER_STYLE: React.CSSProperties = {
  margin: 0,
  padding: 0,
  maxHeight: "30%",
  position: "relative",
  display: "flex",
  flexDirection: "column",
} as const;

interface Props {
  error?: string | object;
  error_component?: JSX.Element | JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
  element_style?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
}

export const ErrorDisplay: React.FC<Props> = React.memo((props: Props) => {
  const {
    error,
    error_component,
    title,
    style,
    element_style,
    bsStyle,
    onClose,
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

  function type() {
    if (
      // only types that antd has...
      bsStyle != null &&
      ["success", "info", "warning", "error"].includes(bsStyle)
    ) {
      bsStyle;
    } else {
      return "error";
    }
  }

  function msgdesc() {
    if (title) {
      return [
        render_title(),
        <div style={{ ...BODY_STYLE, ...style }}>{render_error()}</div>,
      ];
    } else {
      return [
        <div style={{ ...BODY_STYLE, ...style }}>{render_error()}</div>,
        undefined,
      ];
    }
  }

  function render_close() {
    if (onClose == null) return;
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

  const [message, description] = msgdesc();

  return (
    <div style={WRAPPER_STYLE}>
      {render_close()}
      <Alert
        banner
        showIcon={false}
        style={{ ...ELEMENT_STYLE, ...element_style }}
        type={type() as any}
        message={message}
        description={description}
      />
    </div>
  );
});
