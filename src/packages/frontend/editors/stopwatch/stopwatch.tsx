/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The stopwatch and timer component
*/

import { CSSProperties, useEffect, useState } from "react";
import { redux, useForceUpdate } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import moment from "moment";
import { Button, Row, Col, Modal, TimePicker, Tooltip } from "antd";
import {
  DeleteTwoTone,
  PauseCircleTwoTone,
  PlayCircleTwoTone,
  StopTwoTone,
  EditTwoTone,
} from "@ant-design/icons";
import { TimerState } from "./actions";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { TimeAmount } from "./time";

function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

interface StopwatchProps {
  state: TimerState; // 'paused' or 'running' or 'stopped'
  time: number; // when entered this state
  countdown?: number; // if given, this is a countdown timer, counting down from this many seconds.
  clickButton: (str: string) => void;
  setLabel?: (str: string) => void;
  setCountdown?: (time: number) => void; // time in seconds
  compact?: boolean;
  label?: string; // a text label
  noLabel?: boolean; // show no label at all
  noDelete?: boolean; // do not show delete button
  noButtons?: boolean; // hide ALL buttons
  total?: number; // total time accumulated before entering current state
  style?: CSSProperties;
  timeStyle?: CSSProperties;
  readOnly?: boolean; // can't change, and won't display something when timer goes off!
}

export default function Stopwatch(props: StopwatchProps) {
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const [editingTime, setEditingTime] = useState<boolean>(false);
  const update = useForceUpdate();
  const frame = useFrameContext();

  useEffect(() => {
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  function renderStartButton() {
    return (
      <Tooltip
        title={`Start the ${
          props.countdown != null ? "countdown timer" : "stopwatch"
        }`}
      >
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
      <Tooltip
        title={
          <>
            Reset the{" "}
            {props.countdown != null ? "countdown timer" : "stopwatch"} to{" "}
            {props.countdown != null ? (
              <TimeAmount compact amount={props.countdown * 1000} />
            ) : (
              "0"
            )}
          </>
        }
      >
        <Button
          icon={<StopTwoTone />}
          onClick={() => props.clickButton("reset")}
        >
          {!props.compact ? "Reset" : undefined}
        </Button>
      </Tooltip>
    );
  }

  function renderEditTimeButton() {
    const { setCountdown } = props;
    if (setCountdown == null) return;
    return (
      <div>
        <Tooltip title="Edit countdown timer">
          <Button icon={<EditTwoTone />} onClick={() => setEditingTime(true)}>
            {!props.compact ? "Edit" : undefined}
          </Button>
        </Tooltip>
        {editingTime && (
          <TimePicker
            open
            defaultValue={getCountdownMoment(props.countdown)}
            onChange={(time) => {
              if (time != null) {
                setCountdown(
                  time.seconds() + time.minutes() * 60 + time.hours() * 60 * 60
                );
                // timeout so the setcountdown can fully propagate through flux; needed for whiteboard
                setTimeout(() => props.clickButton("reset"), 0);
              }
            }}
            showNow={false}
            onOpenChange={(open) => {
              if (!open) {
                setEditingTime(false);
              }
            }}
          />
        )}
      </div>
    );
  }

  function renderDeleteButton() {
    if (props.compact || props.noDelete) return;
    return (
      <Tooltip
        title={`Delete this ${
          props.countdown != null ? "countdown timer" : "stopwatch"
        }`}
      >
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

  function getRemainingMs(): number {
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

    if (props.countdown != null) {
      // it's a countdown timer.
      amount = Math.max(0, 1000 * props.countdown - amount);
    }
    return amount;
  }

  function renderTime() {
    const amount = getRemainingMs();
    return (
      <>
        <TimeAmount
          key={"time"}
          amount={amount}
          compact={props.compact}
          showIcon={props.compact}
          countdown={props.countdown}
          style={{
            ...props.timeStyle,
            ...(props.countdown && amount == 0
              ? {
                  background: "#b71c1c",
                  borderRadius: "3px",
                  marginRight: "15px",
                  color: "white",
                }
              : undefined),
          }}
        />
        {props.countdown && amount == 0 && !props.readOnly && (
          <Modal
            title={
              <>
                <Icon name="hourglass-half" /> A Countdown Timer in "
                {frame.path}" is Finished
              </>
            }
            visible={true}
            onOk={() => {
              props.clickButton("reset");
              redux
                .getProjectActions(frame.project_id)
                ?.open_file({ path: frame.path });
            }}
            onCancel={() => {
              props.clickButton("reset");
            }}
          >
            {props.label && <StaticMarkdown value={props.label} />}
          </Modal>
        )}
      </>
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
          fontSize: "16px",
          marginTop: "25px",
          width: "100%",
          color: props.label ? "#444" : "#999",
          borderBottom: "1px solid #999",
          marginBottom: "10px",
        }}
        onClick={() => setEditingLabel(true)}
      >
        {props.label ? <StaticMarkdown value={props.label} /> : "Label"}
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
        <MarkdownInput
          autoFocus
          height="150px"
          value={props.label ? props.label : ""}
          onChange={(value) => {
            props.setLabel?.(value);
          }}
          onShiftEnter={() => setEditingLabel(false)}
          onBlur={() => setEditingLabel(false)}
        />
      </div>
    );
  }

  function renderActionButtons() {
    switch (props.state) {
      case "stopped":
        return (
          <Button.Group>
            {renderStartButton()}
            {renderEditTimeButton()}
          </Button.Group>
        );
      case "paused":
        return (
          <Button.Group>
            {renderStartButton()}
            {renderResetButton()}
            {renderEditTimeButton()}
          </Button.Group>
        );
      case "running":
        return (
          <Button.Group>
            {renderPauseButton()}
            {renderResetButton()}
          </Button.Group>
        );
      default:
        assertNever(props.state);
        // TS doesn't have strong enough type inference here??
        return <div />;
    }
  }

  function renderButtons() {
    return (
      <div key="buttons">
        {renderActionButtons()}
        <div style={{ float: "right" }}>{renderDeleteButton()}</div>
      </div>
    );
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
        <div style={{ float: "right", fontSize: "24px", color: "#666" }}>
          {props.countdown != null ? (
            <Tooltip title="Countdown Timer">
              <Icon name="hourglass-half" />
            </Tooltip>
          ) : (
            <Tooltip title="Stopwatch">
              <Icon name="stopwatch" />
            </Tooltip>
          )}
        </div>
        <Row>
          <Col sm={12} md={12}>
            {renderTime()}
          </Col>
          <Col sm={12} md={12}>
            {renderLabel()}
          </Col>
        </Row>
        {!props.noButtons && !props.readOnly && (
          <Row style={{ marginTop: "5px" }}>
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
        {!props.noButtons && !props.readOnly && (
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

export function getCountdownMoment(countdown: number | undefined) {
  let amount = Math.round(countdown ?? 0);
  const m = moment();
  m.seconds(amount % 60);
  amount = (amount - (amount % 60)) / 60;
  m.minutes(amount % 60);
  amount = (amount - (amount % 60)) / 60;
  m.hours(amount);
  return m;
}
