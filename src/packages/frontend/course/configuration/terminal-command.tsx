/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  CSS,
  redux,
  Rendered,
  useActions,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Space } from "@cocalc/frontend/components";
import { Button, Card, Form, Input, List as AntdList } from "antd";
import { fromJS, List, Map } from "immutable";
import { CourseActions } from "../actions";
import { CourseStore, TerminalCommand, TerminalCommandOutput } from "../store";
import { Result } from "../student-projects/run-in-all-projects";

interface Props {
  name: string;
}

export const TerminalCommandPanel: React.FC<Props> = React.memo(
  (props: Props) => {
    const { name } = props;
    const actions = useActions<CourseActions>({ name });
    const terminal_command: TerminalCommand | undefined = useRedux(
      name,
      "terminal_command"
    );

    function render_button(running: boolean): Rendered {
      return (
        <Button
          style={{ width: "6em" }}
          onClick={() => run_terminal_command()}
          disabled={running}
        >
          <Icon name={running ? "cocalc-ring" : "play"} spin={running} />{" "}
          <Space /> Run
        </Button>
      );
    }

    function render_input(): Rendered {
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
          <Input.Group
            compact
            style={{ display: "flex", whiteSpace: "nowrap" }}
          >
            <Input
              style={{ fontFamily: "monospace" }}
              placeholder="Terminal command..."
              onChange={(e) => {
                set_field("input", e.target.value);
              }}
            />
            {render_button(running)}
          </Input.Group>
        </Form>
      );
    }

    function render_running(): Rendered {
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

    function render_output(): Rendered {
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

    function set_field(
      field: "input" | "running" | "output",
      value: any
    ): void {
      const store: CourseStore = get_store();
      let terminal_command: TerminalCommand = store.get(
        "terminal_command",
        Map() as TerminalCommand
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
        await actions.student_projects.run_in_all_student_projects(
          input,
          undefined,
          undefined,
          run_log
        );
      } finally {
        set_field("running", false);
      }
    }

    function render_terminal(): Rendered {
      return (
        <div>
          {render_input()}
          {render_output()}
          {render_running()}
        </div>
      );
    }

    function render_header(): Rendered {
      return (
        <>
          <Icon name="terminal" /> Run Terminal command in all student projects
        </>
      );
    }

    return (
      <Card title={render_header()}>
        {render_terminal()}
        <hr />
        <span style={{ color: "#666" }}>
          Run a terminal command in the home directory of all student projects.
        </span>
      </Card>
    );
  }
);

const PROJECT_LINK_STYLE: CSS = {
  maxWidth: "80%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
  display: "block",
  whiteSpace: "nowrap",
} as const;

const CODE_STYLE: CSS = {
  maxHeight: "200ex",
  overflow: "auto",
  fontSize: "90%",
  padding: "2px",
} as const;

const Output: React.FC<{ result: TerminalCommandOutput }> = React.memo(
  (props) => {
    const { result } = props;

    function open_project(): void {
      const project_id = result.get("project_id");
      redux.getActions("projects").open_project({ project_id });
    }

    const project_id: string = result.get("project_id");
    const title: string = redux.getStore("projects").get_title(project_id);

    const stderr = result.get("stderr");

    return (
      <div style={{ padding: 0, width: "100%" }}>
        <a style={PROJECT_LINK_STYLE} onClick={open_project}>
          {title}
        </a>
        <pre style={CODE_STYLE}>
          {result.get("stdout")}
          {stderr && (
            <div style={{ color: "white", background: "red" }}>{stderr}</div>
          )}
        </pre>
      </div>
    );
  }
);
