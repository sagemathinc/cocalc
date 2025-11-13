/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  List as AntdList,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
} from "antd";
import { List, Map, fromJS } from "immutable";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  CSS,
  redux,
  useActions,
  useRedux,
} from "@cocalc/frontend/app-framework";

import { Gap, Icon, Paragraph } from "@cocalc/frontend/components";
import { course, labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { CourseActions } from "../actions";
import { CourseStore, TerminalCommand, TerminalCommandOutput } from "../store";
import { MAX_PARALLEL_TASKS } from "../student-projects/actions";
import { Result } from "../student-projects/run-in-all-projects";

interface Props {
  name: string;
}

export function TerminalCommandPanel({ name }: Props) {
  const intl = useIntl();
  const actions = useActions<CourseActions>({ name });
  const terminal_command: TerminalCommand | undefined = useRedux(
    name,
    "terminal_command",
  );
  const [timeout, setTimeout] = useState<number | null>(1);

  function render_button(running: boolean) {
    return (
      <Button
        style={{ width: "6em" }}
        onClick={() => run_terminal_command()}
        disabled={running}
      >
        <Icon name={running ? "cocalc-ring" : "play"} spin={running} /> <Gap />{" "}
        Run
      </Button>
    );
  }

  function render_input() {
    const c = terminal_command;
    let running = false;
    if (c != null) {
      running = c.get("running", false);
    }
    return (
      <Form
        style={{ marginBottom: "10px" }}
        onFinish={() => {
          run_terminal_command();
        }}
      >
        <Space.Compact
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            marginBottom: "5px",
          }}
        >
          <Input
            allowClear
            style={{ fontFamily: "monospace" }}
            placeholder={`${intl.formatMessage(labels.terminal_command)}...`}
            onChange={(e) => {
              set_field("input", e.target.value);
            }}
            onPressEnter={() => run_terminal_command()}
          />
          {render_button(running)}
        </Space.Compact>
        <InputNumber
          value={timeout}
          onChange={(t) => setTimeout(t ?? null)}
          min={0}
          max={30}
          addonAfter={"minute timeout"}
        />
      </Form>
    );
  }

  function render_running() {
    const c = terminal_command;
    if (c != null && c.get("running")) {
      return (
        <div
          style={{
            color: "#888",
            padding: "5px",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          <Icon name={"cocalc-ring"} spin /> Running...
        </div>
      );
    }
  }

  function render_output() {
    const c = terminal_command;
    if (c == null) return;
    const output = c.get("output");
    if (!output) return;
    return (
      <AntdList
        size="small"
        style={{ maxHeight: "400px", overflowY: "auto" }}
        bordered
        dataSource={output.toArray()}
        renderItem={(item) => (
          <AntdList.Item style={{ padding: "5px" }}>
            <Output result={item} />
          </AntdList.Item>
        )}
      />
    );
  }

  function get_store(): CourseStore {
    return actions.get_store();
  }

  function set_field(field: "input" | "running" | "output", value: any): void {
    const store: CourseStore = get_store();
    let terminal_command: TerminalCommand = store.get(
      "terminal_command",
      Map() as TerminalCommand,
    );
    if (value == null) {
      terminal_command = terminal_command.delete(field);
    } else {
      terminal_command = terminal_command.set(field, value);
    }
    actions.setState({ terminal_command });
  }

  function run_log(result: Result): void {
    // Important to get from store, not from props, since on second
    // run old output isn't pushed down to props by the time this
    // gets called.
    const store = redux.getStore(name);
    if (!store) {
      return;
    }
    const c = (store as any).get("terminal_command");
    let output;
    if (c == null) {
      output = List();
    } else {
      output = c.get("output", List());
    }
    set_field("output", output.push(fromJS(result)));
  }

  async function run_terminal_command(): Promise<void> {
    const c = terminal_command;
    if (c == null) return;
    const input = c.get("input");
    set_field("output", undefined);
    if (!input) return;
    try {
      set_field("running", true);
      await actions.student_projects.run_in_all_student_projects({
        command: input,
        timeout: (timeout ? timeout : 1) * 60,
        log: run_log,
      });
    } finally {
      set_field("running", false);
    }
  }

  function render_terminal() {
    return (
      <div>
        {render_input()}
        {render_output()}
        {render_running()}
      </div>
    );
  }

  function render_header() {
    return (
      <>
        <Icon name="terminal" />{" "}
        {intl.formatMessage(course.run_terminal_command_title)}
      </>
    );
  }

  return (
    <Card title={render_header()}>
      {render_terminal()}
      <hr />
      <Paragraph type="secondary">
        <FormattedMessage
          id="course.terminal-command.info"
          defaultMessage={`Run a BASH terminal command in the home directory of all student projects.
            Up to {MAX_PARALLEL_TASKS} commands run in parallel,
            with a timeout of {timeout} minutes.`}
          values={{ MAX_PARALLEL_TASKS, timeout }}
        />
      </Paragraph>
    </Card>
  );
}

const PROJECT_LINK_STYLE: CSS = {
  maxWidth: "80%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
  display: "block",
  whiteSpace: "nowrap",
} as const;

const CODE_STYLE: CSS = {
  maxHeight: "200px",
  overflow: "auto",
  fontSize: "90%",
  padding: "2px",
} as const;

const ERR_STYLE: CSS = {
  ...CODE_STYLE,
  color: "white",
  background: COLORS.ANTD_RED,
} as const;

function Output({ result }: { result: TerminalCommandOutput }) {
  function open_project(): void {
    const project_id = result.get("project_id");
    redux.getActions("projects").open_project({ project_id });
  }

  const project_id: string = result.get("project_id");
  const title: string = redux.getStore("projects").get_title(project_id);

  const stdout = result.get("stdout");
  const stderr = result.get("stderr");
  const timeout = result.get("timeout");
  const total_time = result.get("total_time");

  return (
    <RenderOutput
      title={
        <a style={PROJECT_LINK_STYLE} onClick={open_project}>
          {title}
        </a>
      }
      stdout={stdout}
      stderr={stderr}
      timeout={timeout}
      total_time={total_time}
    />
  );
}

export function RenderOutput({ title, stdout, stderr, total_time, timeout }) {
  const noresult = !stdout && !stderr;
  return (
    <div style={{ padding: 0, width: "100%", marginTop: "15px" }}>
      <b>{title}</b>
      {stdout && <pre style={CODE_STYLE}>{stdout.trim()}</pre>}
      {stderr && <pre style={ERR_STYLE}>{stderr.trim()}</pre>}
      {noresult && (
        <div>
          No output{" "}
          {total_time != null && timeout != null && total_time >= timeout - 5
            ? "(possible timeout)"
            : ""}
        </div>
      )}
      {total_time != null && <>(Time: {total_time} seconds)</>}
    </div>
  );
}
