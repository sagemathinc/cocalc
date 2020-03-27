//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
miniterm.cjsx -- a small terminal that lets you enter a single bash command.

IDEAS FOR LATER:

 - [ ] persistent history (in database/project store) -- this is in the log
 - [ ] tab completion
 - [ ] mode to evaluate in another program, e.g., %gp <...>
 - [ ] help

*/

import { analytics_event } from "../../tracker";
import { ProjectActions } from "../../project_actions";
import * as React from "react";
import * as ReactDOM from "react-dom";

const {
  Button,
  FormControl,
  InputGroup,
  FormGroup,
} = require("react-bootstrap");
import { Icon } from "smc-webapp/r_misc";

const { webapp_client } = require("../../webapp_client"); // used to run the command -- could change to use an action and the store.

export const output_style_searchbox: React.CSSProperties = {
  position: "absolute",
  zIndex: 2,
  width: "93%",
  boxShadow: "0px 0px 7px #aaa",
  maxHeight: "450px",
  overflow: "auto",
};

export const output_style_miniterm: React.CSSProperties = {
  position: "absolute",
  zIndex: 2,
  boxShadow: "0px 0px 7px #aaa",
  maxHeight: "450px",
  overflow: "auto",
  right: 0,
  maxWidth: "80%",
  marginRight: "5px",
};

const BAD_COMMANDS = {
  sage: "Create a Sage worksheet instead,\nor type 'sage' in a full terminal.",
  ipython:
    "Create a Jupyter notebook instead,\nor type 'ipython' in a full terminal.",
  gp: "Create a Sage worksheet in GP mode\nor type 'gp' in a full terminal.",
  vi:
    "Type vi in a full terminal instead,\nor just click on the file in the listing.",
  vim:
    "Type vim in a full terminal instead,\nor just click on the file in the listing.",
  emacs:
    "Type emacs in a full terminal instead,\nor just click on the file in the listing.",
  open:
    "The open command is not yet supported\nin the miniterminal.  See\nhttps://github.com/sagemathinc/cocalc/issues/230",
};

const EXEC_TIMEOUT = 10; // in seconds

interface Props {
  current_path: string;
  project_id?: string; // Undefined is = HOME
  actions: ProjectActions;
  show_close_x?: boolean;
}

interface State {
  input: string;
  state: "edit" | "run";
  stdout?: string;
  error?: string;
}

export class MiniTerminal extends React.Component<Props, State> {
  private _id: number = 0;

  constructor(props) {
    super(props);
    this.state = {
      input: "",
      stdout: undefined,
      state: "edit", // 'edit' --> 'run' --> 'edit'
      error: undefined,
    };
  }

  static defaultProps = {
    show_close_x: true,
  };

  execute_command = () => {
    this.setState({ stdout: "", error: "" });
    const input = this.state.input.trim();
    if (!input) {
      return;
    }
    const error = BAD_COMMANDS[input.split(" ")[0]];
    if (error) {
      this.setState({
        state: "edit",
        error,
      });
      return;
    }

    const input0 = input + '\necho $HOME "`pwd`"';
    this.setState({ state: "run" });

    this._id = this._id + 1;
    const id = this._id;
    const start_time = new Date().getTime();
    analytics_event("mini_terminal", "exec", input);
    webapp_client.exec({
      project_id: this.props.project_id,
      command: input0,
      timeout: EXEC_TIMEOUT,
      max_output: 100000,
      bash: true,
      path: this.props.current_path,
      err_on_exit: false,
      cb: (err, output) => {
        if (this._id !== id) {
          // computation was cancelled -- ignore result.
          return;
        }
        if (err) {
          this.setState({ error: JSON.stringify(err), state: "edit" });
        } else if (
          output.exit_code !== 0 &&
          new Date().getTime() - start_time >= 0.98 * EXEC_TIMEOUT
        ) {
          // we get no other error except it takes a long time and the exit_code isn't 0.
          this.setState({
            state: "edit",
            error: `Miniterminal commands are limited to ${EXEC_TIMEOUT} seconds.\nFor longer or interactive commands,\nuse a full terminal.`,
          });
        } else {
          if (output.stdout) {
            // Find the current path
            // after the command is executed, and strip
            // the output of "pwd" from the output:
            let s = output.stdout.trim();
            let i = s.lastIndexOf("\n");
            if (i === -1) {
              output.stdout = "";
            } else {
              s = s.slice(i + 1);
              output.stdout = output.stdout.slice(0, i);
            }
            i = s.indexOf(" ");
            const full_path = s.slice(i + 1);
            if (full_path.slice(0, i) === s.slice(0, i)) {
              // only change if in project
              const path = s.slice(2 * i + 2);
              this.props.actions.open_directory(path);
            }
          }
          if (!output.stderr) {
            // only log commands that worked...
            this.props.actions.log({ event: "miniterm", input });
          }
          this.props.actions.fetch_directory_listing(); // update directory listing (command may change files)
          this.setState({
            state: "edit",
            error: output.stderr,
            stdout: output.stdout,
          });
          if (!output.stderr) {
            this.setState({ input: "" });
          }
        }
      },
    });
  };

  render_button() {
    switch (this.state.state) {
      case "edit":
        return (
          <Button onClick={this.execute_command}>
            <Icon name="play" />
          </Button>
        );
      case "run":
        return (
          <Button onClick={this.execute_command}>
            <Icon name="cc-icon-cocalc-ring" spin />
          </Button>
        );
    }
  }

  render_close_x() {
    if (!this.props.show_close_x) return;
    return (
      <a
        onClick={(e) => {
          e.preventDefault();
          this.setState({ stdout: "", error: "" });
        }}
        href=""
        style={{
          right: "10px",
          top: "0px",
          color: "#666",
          fontSize: "14pt",
          position: "absolute",
        }}
      >
        <Icon name="times" />
      </a>
    );
  }

  render_output(x, style) {
    if (x) {
      return (
        <pre style={style}>
          {this.render_close_x()}
          {x}
        </pre>
      );
    }
  }

  render_clear() {
    if (
      (this.state.stdout ? this.state.stdout.length : 0) == 0 &&
      (this.state.error ? this.state.error.length : 0) == 0
    )
      return;

    return (
      <Button
        onClick={() => this.setState({ stdout: "", error: "" })}
        bsStyle={"warning"}
      >
        <Icon name={"times-circle"} />
      </Button>
    );
  }

  keydown = (e) => {
    // IMPORTANT: if you do window.e and look at e, it's all null!! But it is NOT
    // all null right now -- see
    //     http://stackoverflow.com/questions/22123055/react-keyboard-event-handlers-all-null
    //# e.persist(); window.e = e  # for debugging
    if (e.keyCode === 27) {
      this.setState({ input: "", stdout: "", error: "" });
    }
  };

  render() {
    // NOTE: The style in form below offsets Bootstrap's form margin-bottom of +15 to look good.
    // We don't use inline, since we still want the full horizontal width.
    return (
      <>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            this.execute_command();
          }}
          style={{ marginBottom: "-10px" }}
        >
          <FormGroup>
            <InputGroup>
              <FormControl
                type="text"
                value={this.state.input}
                ref="input"
                placeholder="Terminal command..."
                onChange={(e) => {
                  e.preventDefault();
                  this.setState({
                    input: (ReactDOM.findDOMNode(this.refs.input) as any).value,
                  });
                }}
                onKeyDown={this.keydown}
              />
              <InputGroup.Button>
                {this.render_clear()}
                {this.render_button()}
              </InputGroup.Button>
            </InputGroup>
          </FormGroup>
        </form>
        <div style={output_style_miniterm}>
          {this.render_output(this.state.error, {
            color: "darkred",
            margin: 0,
          })}
          {this.render_output(this.state.stdout, { margin: 0 })}
        </div>
      </>
    );
  }
}
