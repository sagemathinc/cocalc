import * as React from "react";
import { Icon } from "./icon";

interface Props {
  style?: React.CSSProperties;
  close?: () => void;
}

export class CloseX2 extends React.Component<Props> {
  static defaultProps = {
    close: undefined,
    style: {
      cursor: "pointer",
      fontSize: "13pt",
    },
  };

  shouldComponentUpdate(next) {
    return this.props.close != next.close;
  }

  render() {
    if (!this.props.close) return undefined;
    return (
      <div
        className={"pull-right lighten"}
        style={this.props.style}
        onClick={this.props.close}
      >
        <Icon name={"times"} />
      </div>
    );
  }
}
