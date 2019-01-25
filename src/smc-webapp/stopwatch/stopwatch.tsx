/*
The stopwatch component
*/

import { Button, ButtonGroup, Well } from "react-bootstrap";

import { Component, React } from "../app-framework";

import { TimerState } from "./actions"

let { Icon } = require("../r_misc");
let { webapp_client } = require("../webapp_client");

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

interface StopwatchProps {
  state: TimerState; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  click_button: (str: string) => void;
  compact?: boolean;
  label?: string; // a text label
  total?: number; // total time accumulated before entering current state
}

export class Stopwatch extends Component<StopwatchProps, any> {
  private intervals: number[];

  componentWillMount() {
    this.intervals = [];
  }

  setInterval(fn: Function, ms: number): void {
    this.intervals.push(setInterval(fn, ms));
  }

  componentWillUnmount() {
    this.intervals.forEach(clearInterval);
  }

  componentDidMount(): void {
    this.setInterval(() => this.forceUpdate(), 1000);
  }

  render_start_button() {
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

  render_stop_button() {
    return (
      <Button
        bsStyle={!this.props.compact ? "warning" : undefined}
        onClick={() => this.props.click_button("stopped")}
        bsSize={this.props.compact ? "xsmall" : undefined}
      >
        <Icon name="stop" /> {!this.props.compact ? "Stop" : undefined}
      </Button>
    );
  }

  render_pause_button() {
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

  render_time() {
    let amount: number = 0;
    switch (this.props.state) {
      case "stopped":
        break;
      case "paused":
        amount = this.props.total || 0;
        break;
      case "running":
        amount =
          (this.props.total || 0) +
          (webapp_client.server_time() - this.props.time);
        break;
      default:
        assertNever(this.props.state)
    }

    return (
      <TimeAmount key={"time"} amount={amount} compact={this.props.compact} />
    );
  }

  render_buttons(): JSX.Element {
    switch (this.props.state) {
      case "stopped":
        return <span key={"buttons"}>{this.render_start_button()}</span>;
      case "paused":
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
      default:
        assertNever(this.props.state)
        // TS doesn't have strong enough type inference here??
        return <div/>
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
  let t = Math.round(props.amount / 1000);
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
