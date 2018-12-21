import * as React from "react";
import * as misc from "smc-util/misc";

interface Props {
  start_ts?: number;
  interval_s: number;
}

// Converted from https://github.com/andreypopp/react-fa
export class TimeElapsed extends React.Component<Props> {
  private timer?: number;

  shouldComponentUpdate(next) {
    return this.props.start_ts != next.start_ts;
  }

  static defaultProps = {
    interval_s: 1
  };

  clear(): void {
    if (this.timer != null) window.clearInterval(this.timer);
  }

  componentWillUnmount(): void {
    this.clear();
    delete this.timer;
  }

  componentDidMount(): void {
    this.clear();
    this.timer = window.setInterval(
      () => this.forceUpdate(),
      this.props.interval_s * 1000
    );
  }

  render() {
    if (this.props.start_ts == null) return;
    const delta_s = (misc.server_time().getTime() - this.props.start_ts) / 1000;
    const uptime_str = misc.seconds2hms(delta_s, true);
    return <React.Fragment>{uptime_str}</React.Fragment>;
  }
}
