import * as React from "react";
import * as misc from "smc-util/misc";
import { Alert } from "react-bootstrap";
import { CloseX } from "./close-x";

const error_text_style = {
  marginRight: "1ex",
  whiteSpace: "pre-line",
  maxWidth: "80ex"
};

interface Props {
  error?: string | object;
  error_component?: React.ComponentType;
  title?: string;
  style?: React.CSSProperties;
  bsStyle?: string;
  onClose?: () => void;
}

export class ErrorDisplay extends React.Component<Props> {
  render_close_button() {
    if (this.props.onClose == undefined) {
      return;
    }
    return (
      <CloseX on_close={this.props.onClose} style={{ fontSize: "11pt" }} />
    );
  }

  render_title() {
    return <h4>{this.props.title}</h4>;
  }

  render() {
    let error, style;

    if (this.props.style != undefined) {
      style = misc.copy(error_text_style);
      misc.merge(style, this.props.style);
    } else {
      style = error_text_style;
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

    const bsStyle = this.props.bsStyle != undefined ? this.props.bsStyle : "danger";

    return (
      <Alert bsStyle={bsStyle} style={style}>
        {this.render_close_button()}
        {this.props.title ? this.render_title() : undefined}
        {error}
      </Alert>
    );
  }
}
