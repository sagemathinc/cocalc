import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move

const { TimeAgo } = require("../r_misc"); // TODO: import

interface CellTimingProps {
  start?: number;
  end?: number;
  state?: string;
}

export class CellTiming extends Component<CellTimingProps> {
  render() {
    let tip = "";
    if (this.props.start === undefined) {
      return <span />; // TODO: should this return undefined?
    }
    if (this.props.end !== undefined) {
      return `${(this.props.end - this.props.start) / 1000} seconds`;
    } else if (this.props.state === undefined || this.props.state === "done") {
      tip = "(killed)";
    }
    return (
      <div>
        <TimeAgo date={new Date(this.props.start)} />
        <br />
        {tip}
      </div>
    );
  }
}
