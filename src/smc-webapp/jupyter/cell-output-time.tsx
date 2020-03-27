import { React, Component } from "../app-framework";

import { TimeAgo, A, Icon } from "../r_misc";

interface CellTimingProps {
  start?: number;
  end?: number;
  state?: string;
}

export class CellTiming extends Component<CellTimingProps> {
  render() {
    let tip;
    if (this.props.start === undefined) {
      return <span />; // TODO: should this return undefined?
    }
    if (this.props.end !== undefined) {
      return `${(this.props.end - this.props.start) / 1000} seconds`;
    } else if (this.props.state === undefined || this.props.state === "done") {
      tip = (
        <A
          href="https://doc.cocalc.com/howto/jupyter-kernel-terminated.html"
          style={{
            display: "inline-block",
            background: "red",
            color: "white",
            padding: "0 5px",
          }}
        >
          <Icon name="skull" /> Kernel killed...
        </A>
      );
    }
    return (
      <div style={{ float: "right" }}>
        <TimeAgo date={new Date(this.props.start)} />
        <br />
        {tip}
      </div>
    );
  }
}
