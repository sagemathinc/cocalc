/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The stopwatch component
*/

import { Button, Row, Col } from "antd";
import {
  DeleteTwoTone,
  PauseCircleTwoTone,
  PlayCircleTwoTone,
  StopTwoTone,
} from "@ant-design/icons";
import { Component, React, Rendered } from "../app-framework";
import { TimerState } from "./actions";
import { TextInput } from "../r_misc/text-input";
import { webapp_client } from "../webapp-client";

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

interface StopwatchProps {
  state: TimerState; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  click_button: (str: string) => void;
  set_label: (str: string) => void;
  compact?: boolean;
  label?: string; // a text label
  total?: number; // total time accumulated before entering current state
}

interface StopwatchState {
  editing_label: boolean;
}

export class Stopwatch extends Component<StopwatchProps, StopwatchState> {
  private intervals: number[] = [];

  constructor(props) {
    super(props);
    this.state = { editing_label: false };
  }

  private setInterval(fn: Function, ms: number): void {
    this.intervals.push(setInterval(fn, ms));
  }

  public componentWillUnmount(): void {
    this.intervals.forEach(clearInterval);
  }

  public componentDidMount(): void {
    this.setInterval(() => this.forceUpdate(), 1000);
  }

  private render_start_button(): Rendered {
    return (
      <Button
        icon={<PlayCircleTwoTone />}
        onClick={() => this.props.click_button("start")}
        style={!this.props.compact ? { width: "8em" } : undefined}
        size={this.props.compact ? "small" : undefined}
      >
        {!this.props.compact ? "Start" : undefined}
      </Button>
    );
  }

  private render_reset_button(): Rendered {
    return (
      <Button
        icon={<StopTwoTone />}
        onClick={() => this.props.click_button("reset")}
        size={this.props.compact ? "small" : undefined}
      >
        {!this.props.compact ? "Reset" : undefined}
      </Button>
    );
  }

  private render_delete_button(): Rendered {
    if (this.props.compact) return;
    return (
      <Button
        icon={<DeleteTwoTone />}
        onClick={() => this.props.click_button("delete")}
      >
        {!this.props.compact ? "Delete" : undefined}
      </Button>
    );
  }

  private render_pause_button(): Rendered {
    return (
      <Button
        icon={<PauseCircleTwoTone />}
        onClick={() => this.props.click_button("pause")}
        style={!this.props.compact ? { width: "8em" } : undefined}
        size={this.props.compact ? "small" : undefined}
      >
        {!this.props.compact ? "Pause" : undefined}
      </Button>
    );
  }

  private render_time(): Rendered {
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
        assertNever(this.props.state);
    }

    return (
      <TimeAmount key={"time"} amount={amount} compact={this.props.compact} />
    );
  }

  private edit_label(): void {
    this.setState({ editing_label: true });
  }

  private render_label(): Rendered {
    if (this.state.editing_label) {
      return this.render_editing_label();
    }
    return (
      <div
        key="show-label"
        style={{
          fontSize: "25px",
          marginTop: "25px",
          width: "100%",
          color: this.props.label ? "#444" : "#999",
          borderBottom: "1px solid #999",
          marginBottom: "10px",
        }}
        onClick={() => this.edit_label()}
      >
        {this.props.label ? this.props.label : "Label"}
      </div>
    );
  }

  private render_editing_label(): Rendered {
    return (
      <div
        key="edit-label"
        style={{
          fontSize: "25px",
          marginTop: "25px",
          width: "100%",
        }}
      >
        <TextInput
          text={this.props.label ? this.props.label : ""}
          on_change={(value) => {
            this.props.set_label(value);
            this.setState({ editing_label: false });
          }}
          autoFocus={true}
        />
      </div>
    );
  }

  private render_buttons(): Rendered {
    switch (this.props.state) {
      case "stopped":
        return (
          <Button.Group key={"buttons"}>
            {this.render_start_button()}
            {this.render_delete_button()}
          </Button.Group>
        );
      case "paused":
        return (
          <Button.Group key={"buttons"}>
            {this.render_start_button()}
            {this.render_reset_button()}
            {this.render_delete_button()}
          </Button.Group>
        );
      case "running":
        return (
          <Button.Group key={"buttons"}>
            {this.render_pause_button()}
            {this.render_reset_button()}
            {this.render_delete_button()}
          </Button.Group>
        );
      default:
        assertNever(this.props.state);
        // TS doesn't have strong enough type inference here??
        return <div />;
    }
  }

  private render_full_size(): Rendered {
    return (
      <div
        style={{
          borderBottom: "1px solid #666",
          background: "#efefef",
          padding: "15px",
        }}
      >
        <Row>
          <Col sm={12} md={12}>
            {this.render_time()}
          </Col>
          <Col sm={12} md={12}>
            {this.render_label()}
          </Col>
        </Row>
        <Row>
          <Col md={24}>{this.render_buttons()}</Col>
        </Row>
      </div>
    );
  }

  public render(): Rendered {
    if (this.props.compact) {
      return (
        <div>
          {this.render_time()} {this.render_buttons()}
        </div>
      );
    } else {
      return this.render_full_size();
    }
  }
}

const zpad = function (n) {
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
        fontFamily: "courier",
      }}
    >
      {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
    </div>
  );
}
