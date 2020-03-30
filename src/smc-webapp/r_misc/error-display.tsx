import * as React from "react";
import * as misc from "smc-util/misc";
import { Alert } from "antd";

const ERROR_TEXT_STYLE: React.CSSProperties = {
  marginRight: "1ex",
  whiteSpace: "pre-line",
};

const BODY_STYLE: React.CSSProperties = {
  overflowX: "auto",
  marginRight: "10px",
};

interface Props {
  error?: string | object;
  error_component?: JSX.Element | JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
}

export class ErrorDisplay extends React.Component<Props> {
  render_title() {
    return <h4>{this.props.title}</h4>;
  }

  render() {
    let error, style;

    if (this.props.style != undefined) {
      style = misc.copy(ERROR_TEXT_STYLE);
      misc.merge(style, this.props.style);
    } else {
      style = ERROR_TEXT_STYLE;
    }

    if (this.props.error != undefined) {
      if (typeof this.props.error === "string") {
        error = this.props.error;
      } else {
        error = misc.to_json(this.props.error);
      }
    } else {
      error = this.props.error_component;
    }

    let type = this.props.bsStyle;
    if (
      type != "success" &&
      type != "info" &&
      type != "warning" &&
      type != "error"
    ) {
      // only types that antd has...
      type = "error";
    }

    let description: any = undefined,
      message: any;
    if (this.props.title) {
      message = this.props.title;
      description = <div style={BODY_STYLE}>{error}</div>;
    } else {
      message = <div style={BODY_STYLE}>{error}</div>;
    }

    return (
      <div style={style}>
        <Alert
          type={type as any}
          message={message}
          description={description}
          closable={this.props.onClose != null}
          onClose={this.props.onClose}
        />
      </div>
    );
  }
}
