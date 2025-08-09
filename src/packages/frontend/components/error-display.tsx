/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// DEPRECATED -- the ShowError component in ./error.tsx is much better.

import { Alert } from "antd";

// use "style" to customize
const ELEMENT_STYLE: React.CSSProperties = {
  overflowY: "auto",
} as const;

// use "body_style" prop to customize
const BODY_STYLE: React.CSSProperties = {
  marginRight: "10px",
  whiteSpace: "pre-wrap",
} as const;

interface Props {
  error?: string | object;
  error_component?: React.JSX.Element | React.JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
  body_style?: React.CSSProperties;
  componentStyle?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
  banner?: boolean;
}

export function ErrorDisplay({
  error,
  error_component,
  title,
  body_style,
  componentStyle,
  style,
  bsStyle,
  onClose,
  banner = false,
}: Props) {
  function render_title() {
    return <h4>{title}</h4>;
  }

  function render_error() {
    if (error) {
      let e = typeof error == "string" ? error : `${error}`;
      // common prefix with errors due to how they get constructed
      while (e.startsWith("Error: Error")) {
        e = e.slice("Error: ".length);
      }
      return e;
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
    const body = (
      <div style={{ ...BODY_STYLE, ...body_style }}>{render_error()}</div>
    );
    if (title) {
      return [render_title(), body];
    } else {
      return [body, undefined];
    }
  }

  function render_alert() {
    const [message, description] = msgdesc();
    // tweak the case where it's not a banner
    const extra = banner ? undefined : { closable: true, onClose };
    return (
      <Alert
        banner={banner}
        showIcon
        style={{ ...ELEMENT_STYLE, ...style }}
        type={type() as any}
        message={message}
        description={description}
        onClose={onClose}
        closable={onClose != null || banner}
        {...extra}
      />
    );
  }

  return <div style={componentStyle}>{render_alert()}</div>;
}
