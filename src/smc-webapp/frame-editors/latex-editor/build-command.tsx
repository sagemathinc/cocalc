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
  Form,
  FormGroup,
  FormControl
} from "react-bootstrap";

import { React, Rendered, Component } from "../generic/react";

import { split } from "../generic/misc";

import { Engine, build_command } from "./latexmk";

const ENGINES: Engine[] = ["PDFLaTeX", "XeLaTeX", "LuaTex"];

interface Props {
  actions: any;
  filename: string;
  build_command: string | List<string>;
}

interface State {
  build_command: string;
  focus: boolean;
}

export class BuildCommand extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      build_command: this.build_command_string(props.build_command),
      focus: false
    };
  }

  componentWillReceiveProps(next: Props): void {
    if (next.build_command != this.props.build_command) {
      // set by another user or menu selection.
      this.setState({
        build_command: this.build_command_string(next.build_command)
      });
    }
  }

  build_command_string(cmd: string | List<string>): string {
    let s: string;
    if (typeof cmd === "string") {
      s = cmd;
    } else {
      s = "";
      cmd.forEach(function(t: string) {
        if (split(t).length > 1) {
          // some minimal escape for now...
          if (t.indexOf("'") === -1) {
            t = `'${t}'`;
          } else {
            t = `"${t}"`;
          }
        }
        s += " " + t;
      });
    }
    return s;
  }

  render_item(engine: string): Rendered {
    return (
      <MenuItem
        key={engine}
        eventKey={engine}
        onSelect={engine =>
          this.props.actions.set_build_command(
            build_command(engine, this.props.filename)
          )
        }
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
        <DropdownButton
          title="Engine"
          id="cc-latex-build-command"
          pullRight
        >
          {this.render_items()}
        </DropdownButton>
      </ButtonToolbar>
    );
  }

  handle_command_line_change(val: string): void {
    this.setState({ build_command: val });
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
        onBlur={() => {
          this.setState({ focus: false });
          if (
            this.state.build_command !=
            this.build_command_string(this.props.build_command)
          ) {
            this.props.actions.set_build_command(this.state.build_command);
          }
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
          You can enter absolutely any custom build command line you want (it
          will be run using bash, so separate multiple commands with a
          semicolon). You can also use the "Engine" menu to select a
          preset build command. The build command is stored in a comment at the
          bottom of the master LaTeX file.
        </div>
      </Alert>
    );
  }

  render_form(): Rendered {
    return (
      <Form horizontal style={{ marginTop: "5px", marginBottom: "-30px" }}>
        <FormGroup style={{ display: "flex" }}>
          <div style={{ flex: 1, paddingLeft: "15px" }}>
            {this.render_command_line()}
            <br />
            {this.render_help()}
          </div>
          <div style={{ padding: "0 15px 0 5px" }}>
            {this.render_dropdown()}
          </div>
        </FormGroup>
      </Form>
    );
  }
  render(): Rendered {
    if (!this.props.build_command) {
      return <Loading />;
    }
    return this.render_form();
  }
}
