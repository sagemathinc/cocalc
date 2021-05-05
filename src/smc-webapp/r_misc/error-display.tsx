/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import * as misc from "smc-util/misc";
import { Alert } from "antd";

const ERROR_TEXT_STYLE: React.CSSProperties = {
  whiteSpace: "pre-line",
} as const;

const BODY_STYLE: React.CSSProperties = {
  overflowX: "auto",
  marginRight: "10px",
} as const;

interface Props {
  error?: string | object;
  error_component?: JSX.Element | JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
}

export const ErrorDisplay: React.FC<Props> = React.memo((props: Props) => {
  const { error, error_component, title, style, bsStyle, onClose } = props;

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
      bsStyle != "success" &&
      bsStyle != "info" &&
      bsStyle != "warning" &&
      bsStyle != "error"
    ) {
      // only types that antd has...
      return "error";
    } else {
      bsStyle;
    }
  }

  function msgdesc() {
    if (title) {
      return {
        message: render_title(),
        description: <div style={BODY_STYLE}>{render_error()}</div>,
      };
    } else {
      return {
        message: <div style={BODY_STYLE}>{render_error()}</div>,
        description: undefined,
      };
    }
  }

  const { message, description } = msgdesc();

  return (
    <div style={{ ...ERROR_TEXT_STYLE, ...style }}>
      <Alert
        type={type() as any}
        message={message}
        description={description}
        closable={onClose != null}
        onClose={onClose}
      />
    </div>
  );
});
