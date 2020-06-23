/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Customization and selection of the build command.
*/

import { List, fromJS } from "immutable";
import { Loading } from "smc-webapp/r_misc";
import { Alert, FormControl } from "react-bootstrap";
import { Menu, Dropdown, Button } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { React } from "../../app-framework";
import { split } from "smc-util/misc2";
import { Engine, build_command as latexmk_build_command } from "./latexmk";
import { Actions } from "./actions";

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

  if (!focus && build_command_prev != build_command_orig) {
    set_build_command_prev(build_command_orig);
    set_build_command(build_command_string(build_command_orig));
  }

  function select_engine(engine: Engine): void {
    const cmd: string[] = latexmk_build_command(
      engine,
      filename,
      knitr,
      actions.output_directory
    );
    actions.set_build_command(cmd);
    set_build_command(build_command_string(fromJS(cmd)));
  }

  function render_item(engine: string): JSX.Element {
    return <Menu.Item key={engine}>{engine}</Menu.Item>;
  }

  function render_menu(): JSX.Element {
    const v: JSX.Element[] = [];
    for (const engine of ENGINES) {
      v.push(render_item(engine));
    }
    return (
      <Menu
        onClick={(e) => select_engine(e.key as Engine)}
        style={{ maxHeight: "100vH", overflow: "scroll" }}
      >
        {v}
      </Menu>
    );
  }

  function render_dropdown(): JSX.Element {
    return (
      <Dropdown overlay={render_menu()}>
        <Button style={{ float: "right" }}>
          Engine <DownOutlined />
        </Button>
      </Dropdown>
    );
  }

  function handle_command_line_change(val: string): void {
    set_build_command(val);
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

  function render_command_line() {
    return (
      <FormControl
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          textOverflow: "ellipsis",
        }}
        type="text"
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
          set_focus(true);
          handle_build_change();
        }}
      />
    );
    // "any" type above because of https://github.com/facebook/flow/issues/218
  }

  function render_help() {
    if (!focus) return null;
    return (
      <Alert bsStyle="info">
        <div style={{ color: "#666" }}>
          <h4>Build Command</h4>
          Select a build engine from the menu at the right, or enter absolutely
          any custom build command line you want. Custom build commands are run
          using bash, so you can separate multiple commands with a semicolon.
        </div>
      </Alert>
    );
  }

  function render_form() {
    return (
      <div style={{ marginTop: "5px", marginBottom: "-15px" }}>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1 }}>
            {render_command_line()}
            <br />
            {render_help()}
          </div>
          <div style={{ paddingLeft: "5px" }}>{render_dropdown()}</div>
        </div>
      </div>
    );
  }

  if (!build_command) {
    return <Loading />;
  } else {
    return render_form();
  }
});
