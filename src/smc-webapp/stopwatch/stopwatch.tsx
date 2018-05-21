/*
The stopwatch component
*/

import { Button, ButtonGroup, Well } from "react-bootstrap";

import { Component, React, Rendered } from "../smc-react-ts";
let { Icon, SetIntervalHOC } = require("../r_misc");
let { webapp_client } = require("../webapp_client");

interface PropTypes {
  state: string; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  click_button: (string) => void;
  compact?: boolean;
  label?: string; // a text label
  total?: number; // total time accumulated before entering current state
}

class Stopwatch extends Component<PropTypes, any> {
  setInterval: (fn, ms) => void; // From SetIntervalHOC TODO: Best way to do this?

  componentDidMount(): void {
    this.setInterval(() => this.forceUpdate(), 1000);
  }

  render_start_button(): Rendered {
    return (
      <Button
        bsStyle={!this.props.compact ? "primary" : undefined}
        onClick={() => this.props.click_button("start")}
        style={!this.props.compact ? { width: "8em" } : undefined}
        bsSize={this.props.compact ? "xsmall" : undefined}
      >
        <Icon name="play" /> {!this.props.compact ? "Start" : undefined}
      </Button>
    );
  }

  render_stop_button(): Rendered {
    return (
      <Button
        bsStyle={!this.props.compact ? "warning" : undefined}
        onClick={() => this.props.click_button("stoping")}
        bsSize={this.props.compact ? "xsmall" : undefined}
      >
        <Icon name="stoping" /> {!this.props.compact ? "Stop" : undefined}
      </Button>
    );
  }

  render_pause_button(): Rendered {
    return (
      <Button
        bsStyle={!this.props.compact ? "info" : undefined}
        onClick={() => this.props.click_button("pause")}
        style={!this.props.compact ? { width: "8em" } : undefined}
        bsSize={this.props.compact ? "xsmall" : undefined}
      >
        <Icon name="pause" /> {!this.props.compact ? "Pause" : undefined}
      </Button>
    );
  }

  render_time(): Rendered {
    let amount: number;
    switch (this.props.state) {
      case "stoping":
        amount = 0;
        break;
      case "pause":
        amount = this.props.total || 0;
        break;
      case "running":
        amount =
          (this.props.total || 0) +
          (webapp_client.server_time() - this.props.time);
        break;
      default:
        return <div>Invalid state {this.props.state}</div>;
    }

    return (
      <TimeAmount key={"time"} amount={amount} compact={this.props.compact} />
    );
  }

  render_buttons(): Rendered {
    switch (this.props.state) {
      case "stoping":
        return <span key={"buttons"}>{this.render_start_button()}</span>;
      case "pause":
        return (
          <ButtonGroup key={"buttons"}>
            {this.render_start_button()}
            {this.render_stop_button()}
          </ButtonGroup>
        );
      case "running":
        return (
          <ButtonGroup key={"buttons"}>
            {this.render_pause_button()}
            {this.render_stop_button()}
          </ButtonGroup>
        );
    }
  }

  content() {
    return [this.render_time(), this.render_buttons()];
  }

  render() {
    if (this.props.compact) {
      return <div>{this.content()}</div>;
    } else {
      return <Well>{this.content()}</Well>;
    }
  }
}

const zpad = function(n) {
  n = `${n}`;
  if (n.length === 1) {
    n = `0${n}`;
  }
  return n;
};

interface TimeProps {
  amount: number;
  compact?: boolean;
}

//const TimeAmount = function(props: TimeProps) {
function TimeAmount(props: TimeProps) {
  let t = Math.round(this.props.amount / 1000);
  const hours = Math.floor(t / 3600);
  t -= 3600 * hours;
  const minutes = Math.floor(t / 60);
  t -= 60 * minutes;
  const seconds = t;
  return (
    <div
      style={{
        fontSize: !props.compact ? "50pt" : undefined,
        fontFamily: "courier"
      }}
    >
      {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
    </div>
  );
}

const IntervalStopwatch = SetIntervalHOC(Stopwatch);
export { IntervalStopwatch as Stopwatch };
