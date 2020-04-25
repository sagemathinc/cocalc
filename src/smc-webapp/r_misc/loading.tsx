import * as React from "react";
import { Icon } from "./icon";
import { TypedMap } from "../app-framework/TypedMap";

export type Estimate = TypedMap<{
  time: number; // Time in seconds
  type: "new" | "ready" | "archived";
}>;

interface Props {
  style?: React.CSSProperties;
  text?: string;
  estimate?: Estimate;
  theme?: "medium" | undefined;
  delay?: number; // if given, don't show anything until after delay milliseconds.  The component could easily unmount by then, and hence never annoyingly flicker on screen.
}

const LOADING_THEMES: { [keys: string]: React.CSSProperties } = {
  medium: {
    fontSize: "24pt",
    textAlign: "center",
    marginTop: "15px",
    color: "#888",
    background: "white",
  },
};

export class Loading extends React.Component<Props> {
  static defaultProps = { text: "Loading..." };

  render_estimate() {
    if (this.props.estimate != undefined) {
      return (
        <div>
          Loading '{this.props.estimate.get("type")}' file.
          <br />
          Estimated time: {this.props.estimate.get("time")}s
        </div>
      );
    }
  }

  render() {
    let style: React.CSSProperties | undefined = undefined;
    if (this.props.style != undefined) {
      style = this.props.style;
    } else if (this.props.theme != undefined) {
      style = LOADING_THEMES[this.props.theme];
    }

    return (
      <div style={style}>
        <span>
          <Icon name="cc-icon-cocalc-ring" spin /> {this.props.text}
        </span>
        {this.render_estimate()}
      </div>
    );
  }
}
