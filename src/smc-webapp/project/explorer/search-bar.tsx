/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { TERM_MODE_CHAR } from "./file-listing";
import { Icon, SearchInput } from "../../r_misc";
import { ProjectActions } from "smc-webapp/project_store";
import { ListingItem } from "./types";
import { output_style_searchbox } from "./mini-terminal";
const { webapp_client } = require("../../webapp_client");
const feature = require("../../feature");
const { Alert } = require("react-bootstrap");
const misc = require("smc-util/misc");

interface Props {
  project_id: string; // Added by miniterm functionality
  file_search: string;
  current_path?: string;
  actions: ProjectActions;
  create_file: (a, b) => void;
  create_folder: (a) => void;
  selected_file?: ListingItem; // if given, file selected by cursor, which we open on pressing enter
  selected_file_index: number;
  file_creation_error?: string;
  num_files_displayed: number;
  public_view: boolean;
  disabled?: boolean;
  ext_selection?: string;
}

interface State {
  state: "edit" | "run";
  input?: string;
  error?: string;
  stdout?: string;
}

// Commands such as CD throw a setState error.
// Search WARNING to find the line in this class.
export class SearchBar extends React.Component<Props, State> {
  private _id: any;

  static defaultProps = {
    file_search: "",
    selected_file_index: 0,
    num_files_displayed: 0,
    disabled: false,
  };

  constructor(props) {
    super(props);
    // Miniterm functionality
    this.state = {
      stdout: undefined,
      state: "edit", // 'edit' --> 'run' --> 'edit'
      error: undefined,
    };
  }

  // Miniterm functionality
  execute_command(command: string): void {
    this.setState({
      stdout: "",
      error: "",
    });
    const input = command.trim();
    if (!input) {
      return;
    }
    const input0 = input + '\necho $HOME "`pwd`"';
    this.setState({ state: "run" });

    this._id = (this._id != undefined ? this._id : 0) + 1;
    const id = this._id;
    webapp_client.exec({
      project_id: this.props.project_id,
      command: input0,
      timeout: 10,
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
            this.props.actions.log({ event: "termInSearch", input });
          }
          // WARNING: RENDER ERROR. Move state to redux store
          this.setState({
            state: "edit",
            error: output.stderr,
            stdout: output.stdout,
          });
          if (!output.stderr) {
            this.props.actions.set_file_search("");
          }
        }
      },
    });
  }

  render_help_info(): JSX.Element | undefined {
    if (
      this.props.file_search.length > 0 &&
      this.props.num_files_displayed > 0 &&
      this.props.file_search[0] !== TERM_MODE_CHAR
    ) {
      let text;
      const firstFolderPosition = this.props.file_search.indexOf("/");
      if (this.props.file_search === " /") {
        text = "Showing all folders in this directory";
      } else if (firstFolderPosition === this.props.file_search.length - 1) {
        text = `Showing folders matching ${this.props.file_search.slice(
          0,
          this.props.file_search.length - 1
        )}`;
      } else {
        text = `Showing files matching ${this.props.file_search}`;
      }
      return (
        <Alert style={{ wordWrap: "break-word" }} bsStyle="info">
          {text}
        </Alert>
      );
    }
  }

  render_file_creation_error(): JSX.Element | undefined {
    if (this.props.file_creation_error) {
      return (
        <Alert
          style={{ wordWrap: "break-word" }}
          bsStyle="danger"
          onDismiss={this.dismiss_alert}
        >
          {this.props.file_creation_error}
        </Alert>
      );
    }
  }

  // Miniterm functionality
  render_output(x, style): JSX.Element | undefined {
    if (x) {
      return (
        <pre style={style}>
          <a
            onClick={(e) => {
              e.preventDefault();
              this.setState({ stdout: "", error: "" });
            }}
            href=""
            style={{
              right: "5px",
              top: "0px",
              color: "#666",
              fontSize: "14pt",
              position: "absolute",
            }}
          >
            <Icon name="times" />
          </a>
          {x}
        </pre>
      );
    }
  }

  dismiss_alert = (): void => {
    this.props.actions.setState({ file_creation_error: "" });
  };

  search_submit = (value: string, opts: { ctrl_down: boolean }): void => {
    if (value[0] === TERM_MODE_CHAR && !this.props.public_view) {
      const command = value.slice(1, value.length);
      this.execute_command(command);
    } else if (this.props.selected_file) {
      const new_path = misc.path_to_file(
        this.props.current_path,
        this.props.selected_file.name
      );
      const opening_a_dir = this.props.selected_file.isdir;
      if (opening_a_dir) {
        this.props.actions.open_directory(new_path);
        this.props.actions.setState({ page_number: 0 });
      } else {
        this.props.actions.open_file({
          path: new_path,
          foreground: !opts.ctrl_down,
        });
      }
      if (opening_a_dir || !opts.ctrl_down) {
        this.props.actions.set_file_search("");
        this.props.actions.clear_selected_file_index();
      }
    } else if (this.props.file_search.length > 0) {
      if (this.props.file_search[this.props.file_search.length - 1] === "/") {
        this.props.create_folder(!opts.ctrl_down);
      } else {
        this.props.create_file(undefined, !opts.ctrl_down);
      }
      this.props.actions.clear_selected_file_index();
    }
  };

  on_up_press = (): void => {
    if (this.props.selected_file_index > 0) {
      this.props.actions.decrement_selected_file_index();
    }
  };

  on_down_press = (): void => {
    if (this.props.selected_file_index < this.props.num_files_displayed - 1) {
      this.props.actions.increment_selected_file_index();
    }
  };

  on_change = (search: string): void => {
    this.props.actions.zero_selected_file_index();
    this.props.actions.set_file_search(search);
  };

  on_clear = (): void => {
    this.props.actions.clear_selected_file_index();
    this.setState({ input: "", stdout: "", error: "" });
  };

  render(): JSX.Element {
    return (
      <span>
        <SearchInput
          autoFocus={!feature.IS_TOUCH}
          autoSelect={!feature.IS_TOUCH}
          placeholder="Search or create file"
          value={this.props.file_search}
          on_change={this.on_change}
          on_submit={this.search_submit}
          on_up={this.on_up_press}
          on_down={this.on_down_press}
          on_clear={this.on_clear}
          disabled={this.props.disabled || !!this.props.ext_selection}
        />
        {this.render_file_creation_error()}
        {this.render_help_info()}
        <div style={output_style_searchbox}>
          {this.render_output(this.state.error, {
            color: "darkred",
            margin: 0,
          })}
          {this.render_output(this.state.stdout, { margin: 0 })}
        </div>
      </span>
    );
  }
}
