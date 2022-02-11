/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The stopwatch component
*/

import { CSSProperties, useEffect, useState } from "react";
import { useForceUpdate } from "@cocalc/frontend/app-framework";

import { Button, Row, Col, Tooltip } from "antd";
import {
  DeleteTwoTone,
  PauseCircleTwoTone,
  PlayCircleTwoTone,
  StopTwoTone,
} from "@ant-design/icons";
import { TimerState } from "./actions";
//import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { TextInput } from "@cocalc/frontend/components/text-input";
import { webapp_client } from "@cocalc/frontend/webapp-client";

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

interface StopwatchProps {
  state: TimerState; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  clickButton: (str: string) => void;
  setLabel?: (str: string) => void;
  compact?: boolean;
  label?: string; // a text label
  noLabel?: boolean; // show no label at all
  noDelete?: boolean; // do not show delete button
  noButtons?: boolean; // hide ALL buttons
  total?: number; // total time accumulated before entering current state
  style?: CSSProperties;
  timeStyle?: CSSProperties;
}

export default function Stopwatch(props: StopwatchProps) {
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const update = useForceUpdate();

  useEffect(() => {
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  function renderStartButton() {
    return (
      <Tooltip title="Start the stopwatch">
        <Button
          icon={<PlayCircleTwoTone />}
          onClick={() => props.clickButton("start")}
          style={!props.compact ? { width: "8em" } : undefined}
        >
          {!props.compact ? "Start" : undefined}
        </Button>
      </Tooltip>
    );
  }

  function renderResetButton() {
    return (
      <Tooltip title="Reset the stopwatch to 0">
        <Button
          icon={<StopTwoTone />}
          onClick={() => props.clickButton("reset")}
        >
          {!props.compact ? "Reset" : undefined}
        </Button>
      </Tooltip>
    );
  }

  function renderDeleteButton() {
    if (props.compact || props.noDelete) return;
    return (
      <Tooltip title="Delete this stopwatch">
        <Button
          icon={<DeleteTwoTone />}
          onClick={() => props.clickButton("delete")}
        >
          {!props.compact ? "Delete" : undefined}
        </Button>
      </Tooltip>
    );
  }

  function renderPauseButton() {
    return (
      <Tooltip title="Pause the stopwatch">
        <Button
          icon={<PauseCircleTwoTone />}
          onClick={() => props.clickButton("pause")}
          style={!props.compact ? { width: "8em" } : undefined}
        >
          {!props.compact ? "Pause" : undefined}
        </Button>
      </Tooltip>
    );
  }

  function renderTime() {
    let amount: number = 0;
    switch (props.state) {
      case "stopped":
        break;
      case "paused":
        amount = props.total || 0;
        break;
      case "running":
        amount =
          (props.total || 0) + (webapp_client.server_time() - props.time);
        break;
      default:
        assertNever(props.state);
    }

    return (
      <TimeAmount
        key={"time"}
        amount={amount}
        compact={props.compact}
        style={props.timeStyle}
      />
    );
  }

  function renderLabel() {
    if (editingLabel) {
      return renderEditingLabel();
    }
    return (
      <div
        key="show-label"
        style={{
          fontSize: "25px",
          marginTop: "25px",
          width: "100%",
          color: props.label ? "#444" : "#999",
          borderBottom: "1px solid #999",
          marginBottom: "10px",
        }}
        onClick={() => setEditingLabel(true)}
      >
        {props.label ? props.label : "Label"}
      </div>
    );
  }

  function renderEditingLabel() {
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
          text={props.label ? props.label : ""}
          on_change={(value) => {
            props.setLabel?.(value);
            setEditingLabel(false);
          }}
          autoFocus={true}
        />
        {/*
        <MarkdownInput
          value={props.label ? props.label : ""}
          onChange={(value) => {
            props.setLabel?.(value);
            //setState({ editing_label: false });
          }}
        />*/}
      </div>
    );
  }

  function renderButtons() {
    switch (props.state) {
      case "stopped":
        return (
          <Button.Group key={"buttons"}>
            {renderStartButton()}
            {renderDeleteButton()}
          </Button.Group>
        );
      case "paused":
        return (
          <Button.Group key={"buttons"}>
            {renderStartButton()}
            {renderResetButton()}
            {renderDeleteButton()}
          </Button.Group>
        );
      case "running":
        return (
          <Button.Group key={"buttons"}>
            {renderPauseButton()}
            {renderResetButton()}
            {renderDeleteButton()}
          </Button.Group>
        );
      default:
        assertNever(props.state);
        // TS doesn't have strong enough type inference here??
        return <div />;
    }
  }

  function renderFullSize() {
    if (props.noLabel) {
      return (
        <div
          style={{
            borderBottom: "1px solid #666",
            background: "#efefef",
            padding: "15px",
            ...props.style,
          }}
        >
          <div>{renderTime()}</div>
          <div>{renderButtons()}</div>
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
            {renderTime()}
          </Col>
          <Col sm={12} md={12}>
            {renderLabel()}
          </Col>
        </Row>
        {!props.noButtons && (
          <Row>
            <Col md={24}>{renderButtons()}</Col>
          </Row>
        )}
      </div>
    );
  }

  if (props.compact) {
    return (
      <div style={{ display: "flex" }}>
        {renderTime()}
        {!props.noButtons && (
          <div style={{ marginTop: "3px", marginLeft: "5px" }}>
            {renderButtons()}
          </div>
        )}
      </div>
    );
  } else {
    return renderFullSize();
  }
}

function zpad(n: number): string {
  let s = `${n}`;
  if (s.length === 1) {
    s = `0${s}`;
  }
  return s;
}

interface TimeProps {
  amount: number;
  compact?: boolean;
  style?: CSSProperties;
}

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
