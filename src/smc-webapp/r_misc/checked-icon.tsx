import * as React from "react";
import { Icon } from "./icon";
const { is_different } = require("smc-util/misc");

interface Props {
  checked?: boolean;
}

export class CheckedIcon extends React.Component<Props> {
  static defaultProps = {
    checked: false
  };

  shouldComponentUpdate(props) {
    return is_different(this.props, props, ["checked"]);
  }

  render() {
    const name = this.props.checked ? "check-square-o" : "square-o";
    return <Icon name={name} />;
  }
}
