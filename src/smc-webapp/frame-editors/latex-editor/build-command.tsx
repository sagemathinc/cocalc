/*
Customization and selection of the build command.

*/

import { List, fromJS } from "immutable";

import { Loading } from "smc-webapp/r_misc";

import { Alert, FormControl } from "react-bootstrap";

import { Menu, Dropdown, Button, Icon } from "cocalc-ui";

import { React, Rendered, Component } from "../../app-framework";

import { split } from "smc-util/misc2";

import { Engine, build_command } from "./latexmk";
import { Actions } from "./actions";

const ENGINES: Engine[] = [
  "PDFLaTeX",
  "PDFLaTeX (shell-escape)",
  "XeLaTeX",
  "LuaTex"
];

interface Props {
  actions: Actions;
  filename: string;
  build_command: string | List<string>;
  knitr: boolean;
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
    if (this.state.focus) {
      return;
    }
    if (next.build_command != this.props.build_command) {
      // set by another user or menu selection.
      this.setState({
        build_command: this.build_command_string(next.build_command)
      });
    }
  }

  // cmd could be undefined -- https://github.com/sagemathinc/cocalc/issues/3290
  build_command_string(cmd: string | List<string> | undefined): string {
    let s: string;
    if (cmd == null) {
      // cmd is not initialized, see actions._init_config
      return "";
    } else if (typeof cmd === "string") {
      s = cmd;
    } else {
      const v: string[] = [];
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
    const cmd: string[] = build_command(
      engine,
      this.props.filename,
      this.props.knitr,
      this.props.actions.output_directory
    );
    this.props.actions.set_build_command(cmd);
    this.setState({ build_command: this.build_command_string(fromJS(cmd)) });
  }

  render_item(engine: string): Rendered {
    return <Menu.Item key={engine}>{engine}</Menu.Item>;
  }

  render_menu(): Rendered {
    const v: Rendered[] = [];
    for (const engine of ENGINES) {
      v.push(this.render_item(engine));
    }
    return (
      <Menu
        onClick={e => this.select_engine(e.key as Engine)}
        style={{ maxHeight: "100vH", overflow: "scroll" }}
      >
        {v}
      </Menu>
    );
  }

  render_dropdown(): Rendered {
    return (
      <Dropdown overlay={this.render_menu()}>
        <Button style={{ float: "right" }}>
          Engine <Icon type="down" />
        </Button>
      </Dropdown>
    );
  }

  handle_command_line_change(val: string): void {
    this.setState({ build_command: val });
  }

  handle_build_change(): void {
    if (
      this.state.build_command !=
      this.build_command_string(this.props.build_command)
    ) {
      if (!this.state.build_command) {
        this.select_engine(ENGINES[0]);
      } else {
        this.props.actions.set_build_command(this.state.build_command);
      }
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
    if (!this.props.build_command) {
      return <Loading />;
    }
    return this.render_form();
  }
}
