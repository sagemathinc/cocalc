/*
Customization and selection of the build command.

*/

import { List } from "immutable";

const { Loading } = require("smc-webapp/r_misc");

import {
  Alert,
  MenuItem,
  DropdownButton,
  ButtonToolbar,
  FormControl
} from "react-bootstrap";

import { React, Rendered, Component } from "../../app-framework";

import { split } from "../generic/misc";

import { Engine, build_command } from "./latexmk";

const ENGINES: Engine[] = ["PDFLaTeX", "XeLaTeX", "LuaTex"];

interface Props {
  actions: any;
  filename: string;
  build_command: string | List<string>;
  knitr: boolean;
}

interface State {
  build_command: string;
  prev_build_command?: string;
  focus: boolean;
}

export class BuildCommand extends Component<Props, State> {
  constructor(props) {
    super(props);
    let cmd = this.build_command_string(props.build_command);
    if (!cmd) {
      // sane default
      cmd = this.default_command(props);
    }
    this.state = {
      build_command: cmd,
      focus: false
    };
  }

  default_command(props): string {
    let cmd: string[] = build_command(ENGINES[0], props.filename, props.knitr);
    return this.build_command_string(List(cmd));
  }

  getDerivedStateFromProps(props: Props, state: State) {
    // we don't change the build command, if user has it currently focused
    if (!state.build_command) {
      let init_cmd = this.default_command(props);
      return { build_command: init_cmd };
    }
    let new_build_cmd = this.build_command_string(props.build_command);
    if (state.prev_build_command != new_build_cmd) {
      if (!state.focus) {
        return {
          build_command: new_build_cmd,
          prev_build_command: new_build_cmd
        };
      } else {
        return undefined;
      }
    }
    return undefined;
  }

  build_command_string(cmd: string | List<string>): string {
    let s: string;
    if (typeof cmd === "string") {
      s = cmd;
    } else {
      let v: string[] = [];
      cmd.forEach(function(t: string) {
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

  select_engine(engine: Engine): void {
    this.props.actions.set_build_command(
      build_command(engine, this.props.filename, this.props.knitr)
    );
  }

  render_item(engine: string): Rendered {
    return (
      <MenuItem
        key={engine}
        eventKey={engine}
        onSelect={engine => this.select_engine(engine)}
      >
        {engine}
      </MenuItem>
    );
  }

  render_items(): Rendered[] {
    const v: Rendered[] = [];
    for (let engine of ENGINES) {
      v.push(this.render_item(engine));
    }
    return v;
  }

  render_dropdown(): Rendered {
    return (
      <ButtonToolbar>
        <DropdownButton title="Engine" id="cc-latex-build-command" pullRight>
          {this.render_items()}
        </DropdownButton>
      </ButtonToolbar>
    );
  }

  handle_command_line_change(val: string): void {
    this.setState({ build_command: val });
  }

  handle_build_change(): void {
    this.setState({ focus: false });
    if (
      this.state.build_command !=
      this.build_command_string(this.props.build_command)
    ) {
      this.props.actions.set_build_command(this.state.build_command);
    }
  }

  render_command_line(): Rendered {
    return (
      <FormControl
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          textOverflow: "ellipsis"
        }}
        type="text"
        value={this.state.build_command}
        onChange={e => this.handle_command_line_change((e.target as any).value)}
        onFocus={() => this.setState({ focus: true })}
        onKeyDown={evt => {
          if (
            evt.keyCode == 13 ||
            ((evt.metaKey || evt.ctrlKey) &&
              String.fromCharCode(evt.which).toLowerCase() == "s")
          ) {
            this.handle_build_change();
            evt.preventDefault();
          }
        }}
        onBlur={() => {
          this.setState({ focus: false });
          this.handle_build_change();
        }}
      />
    );
    // "any" type above because of https://github.com/facebook/flow/issues/218
  }

  render_help(): Rendered {
    if (!this.state.focus) return;
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

  render_form(): Rendered {
    return (
      <div style={{ marginTop: "5px", marginBottom: "-15px" }}>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1 }}>
            {this.render_command_line()}
            <br />
            {this.render_help()}
          </div>
          <div style={{ paddingLeft: "5px" }}>{this.render_dropdown()}</div>
        </div>
      </div>
    );
  }
  render(): Rendered {
    if (!this.state.build_command) {
      return <Loading />;
    }
    return this.render_form();
  }
}
