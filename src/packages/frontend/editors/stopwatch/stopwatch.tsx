/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The stopwatch component
*/

import { CSSProperties } from "react";
import { Button, Row, Col, Tooltip } from "antd";
import {
  DeleteTwoTone,
  PauseCircleTwoTone,
  PlayCircleTwoTone,
  StopTwoTone,
} from "@ant-design/icons";
import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { TimerState } from "./actions";
import { TextInput } from "@cocalc/frontend/components/text-input";
import { webapp_client } from "@cocalc/frontend/webapp-client";

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

interface StopwatchProps {
  state: TimerState; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  click_button: (str: string) => void;
  set_label?: (str: string) => void;
  compact?: boolean;
  label?: string; // a text label
  noLabel?: boolean; // show no label at all
  noDelete?: boolean; // do not show delete button
  noButtons?: boolean; // hide ALL buttons
  total?: number; // total time accumulated before entering current state
  style?: CSSProperties;
  timeStyle?: CSSProperties;
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
      <Tooltip title="Start the stopwatch">
        <Button
          icon={<PlayCircleTwoTone />}
          onClick={() => this.props.click_button("start")}
          style={!this.props.compact ? { width: "8em" } : undefined}
        >
          {!this.props.compact ? "Start" : undefined}
        </Button>
      </Tooltip>
    );
  }

  private render_reset_button(): Rendered {
    return (
      <Tooltip title="Reset the stopwatch to 0">
        <Button
          icon={<StopTwoTone />}
          onClick={() => this.props.click_button("reset")}
        >
          {!this.props.compact ? "Reset" : undefined}
        </Button>
      </Tooltip>
    );
  }

  private render_delete_button(): Rendered {
    if (this.props.compact || this.props.noDelete) return;
    return (
      <Tooltip title="Delete this stopwatch">
        <Button
          icon={<DeleteTwoTone />}
          onClick={() => this.props.click_button("delete")}
        >
          {!this.props.compact ? "Delete" : undefined}
        </Button>
      </Tooltip>
    );
  }

  private render_pause_button(): Rendered {
    return (
      <Tooltip title="Pause the stopwatch">
        <Button
          icon={<PauseCircleTwoTone />}
          onClick={() => this.props.click_button("pause")}
          style={!this.props.compact ? { width: "8em" } : undefined}
        >
          {!this.props.compact ? "Pause" : undefined}
        </Button>
      </Tooltip>
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
      <TimeAmount
        key={"time"}
        amount={amount}
        compact={this.props.compact}
        style={this.props.timeStyle}
      />
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
            this.props.set_label?.(value);
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
    if (this.props.noLabel) {
      return (
        <div
          style={{
            borderBottom: "1px solid #666",
            background: "#efefef",
            padding: "15px",
            ...this.props.style,
          }}
        >
          <div>{this.render_time()}</div>
          <div>{this.render_buttons()}</div>
        </div>
      );
    }
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
        {!this.props.noButtons && (
          <Row>
            <Col md={24}>{this.render_buttons()}</Col>
          </Row>
        )}
      </div>
    );
  }

  public render(): Rendered {
    if (this.props.compact) {
      return (
        <div style={{ display: "flex" }}>
          {this.render_time()}
          {!this.props.noButtons && (
            <div style={{ marginTop: "3px", marginLeft: "5px" }}>
              {this.render_buttons()}
            </div>
          )}
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
  style?: CSSProperties;
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
        ...props.style,
      }}
    >
      {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
    </div>
  );
}
