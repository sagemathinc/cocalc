/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Customization and selection of the build command.
*/

import { SaveOutlined } from "@ant-design/icons";
import { Alert, Form, Input, Select } from "antd";
import { List } from "immutable";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { React } from "@cocalc/frontend/app-framework";
import { Icon, Loading, Paragraph } from "@cocalc/frontend/components";
import { split } from "@cocalc/util/misc";
import { Actions } from "./actions";
import { BuildControls } from "./output-control-build";
import {
  Engine,
  ENGINES,
  build_command as latexmk_build_command,
} from "./latexmk";

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
  font_size: number;
  build_command_hardcoded?: boolean;
}

export const BuildCommand: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions,
    filename,
    build_command: build_command_orig,
    knitr,
    font_size,
    build_command_hardcoded = false,
  } = props;
  const [build_command_prev, set_build_command_prev] =
    React.useState(build_command_orig);
  const [build_command, set_build_command] = React.useState<string>(
    build_command_string(build_command_orig),
  );
  const [focus, set_focus] = React.useState<boolean>(false);
  const [dirty, set_dirty] = React.useState<boolean>(false);
  const [show_hardcoded_info, set_show_hardcoded_info] =
    React.useState<boolean>(false);

  if (!focus && build_command_prev != build_command_orig) {
    set_build_command_prev(build_command_orig);
    set_build_command(build_command_string(build_command_orig));
  }

  function select_engine(engine: Engine): void {
    const cmd: string[] = latexmk_build_command(
      engine,
      filename,
      knitr,
      actions.output_directory,
    );
    actions.set_build_command(cmd);
  }

  function rescan(): void {
    actions.init_build_directive(true);
  }

  function engineOptions() {
    return ENGINES.map((engine) => {
      return {
        key: engine,
        value: engine,
        label: engine,
      };
    });
  }

  function render_engines(): React.JSX.Element {
    return (
      <Select
        style={{ width: "200px" }}
        placement={"bottomRight"}
        options={engineOptions()}
        disabled={build_command_hardcoded}
        onChange={select_engine}
        placeholder="Engine..."
      >
        Engine
      </Select>
    );
  }

  function handle_command_line_change(val: string): void {
    set_build_command(val);
    set_dirty(true);
  }

  function handle_build_change(): void {
    if (!build_command) {
      // fallback
      select_engine(ENGINES[0]);
    } else {
      // NOTE: we no longer allow the command to be arbitrary -- it gets some sanity checks
      // and improvements. This does make certain things that used to be possible now IMPOSSIBLE.
      // Sorry, but that's the best we can do without significant changes.  See #5183
      const sanitized = actions.sanitize_build_cmd_str(build_command);
      actions.set_build_command(sanitized);
      set_build_command(sanitized);
    }
    set_dirty(false);
    set_focus(false);
  }

  function render_input() {
    return (
      <Input
        style={{
          fontFamily: "monospace",
          fontSize: font_size,
          textOverflow: "ellipsis",
        }}
        value={build_command}
        disabled={build_command_hardcoded}
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
          handle_build_change();
        }}
        addonBefore={<BuildControls actions={actions} narrow={true} />}
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
        <Form.Item style={{ marginRight: "5px" }}>{render_engines()}</Form.Item>
      </Form>
    );
  }

  function render_save() {
    return (
      <Button
        disabled={!dirty}
        bsSize={"xsmall"}
        bsStyle={dirty ? "success" : undefined}
        title={"Saves the modified command (or just hit the 'Return' key)"}
        onClick={() => handle_build_change()}
      >
        <SaveOutlined />
      </Button>
    );
  }

  function render_help() {
    if (!focus) return null;
    return (
      <Alert
        type="info"
        style={{ padding: "10px 10px 0 10px" }}
        showIcon={false}
        message={"Build Command Help"}
        description={
          <Paragraph style={{ fontSize: "90%" }}>
            Select a build engine from the menu at the right, or enter
            absolutely any custom build command line you want. Custom build
            commands are run using bash, so you can separate multiple commands
            with a semicolon. If there is no semicolon, then the command line
            must end with the filename (not including the directory).
          </Paragraph>
        }
      />
    );
  }

  function renderHardcodedInfo() {
    if (!show_hardcoded_info) return null;
    return (
      <Alert
        type="warning"
        showIcon={false}
        style={{ padding: "10px 10px 0 10px" }}
        description={
          <>
            <Paragraph>
              There is a <code>% !TeX cocalc = ...</code> directive in your
              document. This hardcodes the build command for this document. The
              command is sanitized to work well with this editor by e.g. always
              replacing the last token to the current file name. To disable any
              sanitization, add a semicolon at the end or use a semicolon to
              issue more than one command.
            </Paragraph>
            <Paragraph>
              After changing the build command directive, commenting it out via{" "}
              <code>%% </code> or removing it, make sure to{" "}
              <a onClick={() => rescan()}>rescan the document</a>.
            </Paragraph>
            <Paragraph>
              Example:{" "}
              <code>
                % !TeX cocalc = latexmk -pdf -f -g -bibtex -deps -synctex=1
                -interaction=nonstopmode file.tex
              </code>
              .
            </Paragraph>
          </>
        }
      />
    );
  }

  function render_hardcoded() {
    return (
      <>
        <h4>
          Hardcoded build-command
          <a
            style={{ float: "right" }}
            onClick={() => set_show_hardcoded_info(!show_hardcoded_info)}
          >
            <Icon name={"question-circle"} />{" "}
            {show_hardcoded_info ? "Close Help" : "Help"}
          </a>
          <a
            style={{ float: "right", marginRight: "10px" }}
            onClick={() => rescan()}
          >
            <Icon name="reload" /> Rescan
          </a>
        </h4>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div>
            <BuildControls actions={actions} narrow={true} />
          </div>
          <pre style={{ whiteSpace: "pre-line", flex: 1, margin: 0 }}>
            {build_command}
          </pre>
        </div>
        {renderHardcodedInfo()}
      </>
    );
  }

  function render_body() {
    if (build_command_hardcoded) {
      return <>{render_hardcoded()}</>;
    } else {
      return (
        <>
          {render_command_line()}
          {render_help()}
        </>
      );
    }
  }

  if (build_command == null) {
    return <Loading />;
  } else {
    return (
      <div
        style={{ paddingRight: "5px" }}
        role="region"
        aria-label="Build command"
      >
        {render_body()}
      </div>
    );
  }
});
