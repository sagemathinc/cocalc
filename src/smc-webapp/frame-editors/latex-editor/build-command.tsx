/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Customization and selection of the build command.
*/

import { List, fromJS } from "immutable";
import { Loading } from "smc-webapp/r_misc";
import { Alert } from "react-bootstrap";
import { Button, Input, Select, Form } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { React } from "../../app-framework";
import { split } from "smc-util/misc2";
import { Engine, build_command as latexmk_build_command } from "./latexmk";
import { Actions } from "./actions";
import { COLORS } from "../../../smc-util/theme";

const ENGINES: Engine[] = [
  "PDFLaTeX",
  "PDFLaTeX (shell-escape)",
  "XeLaTeX",
  "LuaTex",
];

// cmd could be undefined -- https://github.com/sagemathinc/cocalc/issues/3290
function build_command_string(cmd: string | List<string>): string {
  let s: string;
  if (cmd == null) {
    // cmd is not initialized, see actions._init_config
    return "";
  } else if (typeof cmd === "string") {
    s = cmd;
  } else {
    const v: string[] = [];
    cmd.forEach(function (t: string) {
      if (split(t).length > 1) {
        // some minimal escape for now...
        if (t.indexOf("'") === -1) {
          t = `'${t}'`;
        } else {
          t = `"${t}"`;
        }
      }
      v.push(t);
    });
    s = v.join(" ");
  }
  return s;
}

interface Props {
  actions: Actions;
  filename: string;
  build_command: string | List<string>;
  knitr: boolean;
}

export const BuildCommand: React.FC<Props> = React.memo((props: Props) => {
  const { actions, filename, build_command: build_command_orig, knitr } = props;
  const [build_command_prev, set_build_command_prev] = React.useState(
    build_command_orig
  );
  const [build_command, set_build_command] = React.useState<string>(
    build_command_string(build_command_orig)
  );
  const [focus, set_focus] = React.useState<boolean>(false);
  const [dirty, set_dirty] = React.useState<boolean>(false);

  if (!focus && build_command_prev != build_command_orig) {
    set_build_command_prev(build_command_orig);
    set_build_command(build_command_string(build_command_orig));
  }

  function select_engine(engine: Engine | "Engine"): void {
    if (engine == "Engine") return;
    const cmd: string[] = latexmk_build_command(
      engine,
      filename,
      knitr,
      actions.output_directory
    );
    actions.set_build_command(cmd);
    set_build_command(build_command_string(fromJS(cmd)));
  }

  function render_engine_options(): JSX.Element {
    const v: JSX.Element[] = [
      <Select.Option key={"Engine"} value={"Engine"}>
        Engine
      </Select.Option>,
    ];
    for (const engine of ENGINES) {
      v.push(
        <Select.Option key={engine} value={engine} size={"small"}>
          {engine}
        </Select.Option>
      );
    }
    return <>{v}</>;
  }

  function render_engines(): JSX.Element {
    return (
      <Select
        defaultValue={"Engine"}
        size={"small"}
        onChange={(val) => select_engine(val)}
      >
        {render_engine_options()}
      </Select>
    );
  }

  function handle_command_line_change(val: string): void {
    set_build_command(val);
    set_dirty(true);
  }

  function handle_build_change(): void {
    if (build_command != build_command_string(build_command)) {
      if (!build_command) {
        select_engine(ENGINES[0]);
      } else {
        actions.set_build_command(build_command);
      }
    }
  }

  function render_input() {
    return (
      <Input
        style={{
          fontFamily: "monospace",
          fontSize: "11px",
          textOverflow: "ellipsis",
        }}
        value={build_command}
        onChange={(e) => handle_command_line_change((e.target as any).value)}
        onFocus={() => set_focus(true)}
        onKeyDown={(evt) => {
          if (
            evt.keyCode == 13 ||
            ((evt.metaKey || evt.ctrlKey) &&
              String.fromCharCode(evt.which).toLowerCase() == "s")
          ) {
            handle_build_change();
            evt.preventDefault();
          }
        }}
        onBlur={() => {
          set_focus(false);
          handle_build_change();
        }}
      />
    );
  }

  function render_command_line() {
    return (
      <Form name="command_line" layout="inline">
        <Form.Item style={{ flex: "1 1 auto", marginRight: "0" }}>
          {render_input()}
        </Form.Item>
        <Form.Item>{render_save()}</Form.Item>
        <Form.Item style={{ maxWidth: "25%", marginRight: "0" }}>
          {render_engines()}
        </Form.Item>
      </Form>
    );
  }

  function render_save() {
    return (
      <Button
        disabled={!dirty}
        size={"small"}
        icon={<SaveOutlined />}
        onClick={() => set_dirty(false)}
      />
    );
  }

  function render_help() {
    if (!focus) return null;
    return (
      <Alert bsStyle="info">
        <div style={{ color: COLORS.GRAY }}>
          <h4>Build Command</h4>
          Select a build engine from the menu at the right, or enter absolutely
          any custom build command line you want. Custom build commands are run
          using bash, so you can separate multiple commands with a semicolon.
        </div>
      </Alert>
    );
  }

  function render_body() {
    return (
      <div>
        {render_command_line()}
        {render_help()}
      </div>
    );
  }

  if (!build_command) {
    return <Loading />;
  } else {
    return render_body();
  }
});
