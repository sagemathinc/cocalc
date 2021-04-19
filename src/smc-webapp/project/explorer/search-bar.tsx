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
import { webapp_client } from "../../webapp-client";
import { IS_TOUCH } from "../../feature";
import { Alert } from "react-bootstrap";
import { path_to_file } from "smc-util/misc";

interface Props {
  project_id: string; // Added by miniterm functionality
  file_search: string;
  current_path?: string;
  actions: ProjectActions;
  create_file: (a, b) => void;
  create_folder: (a) => void;
  selected_file?: ListingItem; // if given, file selected by cursor, which we open on pressing enter
  selected_file_index?: number;
  file_creation_error?: string;
  num_files_displayed?: number;
  public_view: boolean;
  disabled?: boolean;
  ext_selection?: string;
}

// Commands such as CD throw a setState error.
// Search WARNING to find the line in this class.
export const SearchBar = React.memo((props: Props) => {
  const {
    project_id,
    file_search = "",
    current_path,
    actions,
    create_file,
    create_folder,
    selected_file,
    selected_file_index = 0,
    file_creation_error,
    num_files_displayed = 0,
    public_view,
    disabled = false,
    ext_selection,
  } = props;

  // edit → run → edit
  // TODO use "state" to show a progress spinner while a command is running
  // @ts-ignore
  const [state, set_state] = React.useState<"edit" | "run">("edit");
  const [error, set_error] = React.useState<string | undefined>(undefined);
  const [stdout, set_stdout] = React.useState<string | undefined>(undefined);
  const [cmd, set_cmd] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (cmd == null) return;
    const input = cmd;
    const input0 = input + '\necho $HOME "`pwd`"';
    webapp_client.exec({
      project_id,
      command: input0,
      timeout: 10,
      max_output: 100000,
      bash: true,
      path: current_path,
      err_on_exit: false,
      cb: (err, output) => {
        if (err) {
          set_error(JSON.stringify(err));
          set_state("edit");
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
              actions.open_directory(path);
            }
          }
          if (!output.stderr) {
            // only log commands that worked...
            actions.log({ event: "termInSearch", input });
          }
          // WARNING: RENDER ERROR. Move state to redux store
          set_state("edit");
          set_error(output.stderr);
          set_stdout(output.stdout);
          if (!output.stderr) {
            actions.set_file_search("");
          }
        }
      },
    });
  }, [cmd]);

  // Miniterm functionality
  function execute_command(command: string): void {
    set_error("");
    set_stdout("");
    const input = command.trim();
    if (!input) {
      return;
    }
    set_state("run");
    set_cmd(input);
  }

  function render_help_info(): JSX.Element | undefined {
    if (
      file_search.length > 0 &&
      num_files_displayed > 0 &&
      file_search[0] !== TERM_MODE_CHAR
    ) {
      let text;
      const firstFolderPosition = file_search.indexOf("/");
      if (file_search === " /") {
        text = "Showing all folders in this directory";
      } else if (firstFolderPosition === file_search.length - 1) {
        text = `Showing folders matching ${file_search.slice(
          0,
          file_search.length - 1
        )}`;
      } else {
        text = `Showing files matching ${file_search}`;
      }
      return (
        <Alert style={{ wordWrap: "break-word" }} bsStyle="info">
          {text}
        </Alert>
      );
    }
  }

  function render_file_creation_error(): JSX.Element | undefined {
    if (file_creation_error) {
      return (
        <Alert
          style={{ wordWrap: "break-word" }}
          bsStyle="danger"
          onDismiss={dismiss_alert}
        >
          {file_creation_error}
        </Alert>
      );
    }
  }

  // Miniterm functionality
  function render_output(x, style): JSX.Element | undefined {
    if (x) {
      return (
        <pre style={style}>
          <a
            onClick={(e) => {
              e.preventDefault();
              set_stdout("");
              set_error("");
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

  function dismiss_alert(): void {
    actions.setState({ file_creation_error: "" });
  }

  function search_submit(value: string, opts: { ctrl_down: boolean }): void {
    if (current_path == null) {
      return;
    }
    if (value[0] === TERM_MODE_CHAR && !public_view) {
      const command = value.slice(1, value.length);
      execute_command(command);
    } else if (selected_file) {
      const new_path = path_to_file(current_path, selected_file.name);
      const opening_a_dir = selected_file.isdir;
      if (opening_a_dir) {
        actions.open_directory(new_path);
        actions.setState({ page_number: 0 });
      } else {
        actions.open_file({
          path: new_path,
          foreground: !opts.ctrl_down,
        });
      }
      if (opening_a_dir || !opts.ctrl_down) {
        actions.set_file_search("");
        actions.clear_selected_file_index();
      }
    } else if (file_search.length > 0) {
      if (file_search[file_search.length - 1] === "/") {
        create_folder(!opts.ctrl_down);
      } else {
        create_file(undefined, !opts.ctrl_down);
      }
      actions.clear_selected_file_index();
    }
  }

  function on_up_press(): void {
    if (selected_file_index > 0) {
      actions.decrement_selected_file_index();
    }
  }

  function on_down_press(): void {
    if (selected_file_index < num_files_displayed - 1) {
      actions.increment_selected_file_index();
    }
  }

  function on_change(search: string): void {
    actions.zero_selected_file_index();
    actions.set_file_search(search);
  }

  function on_clear(): void {
    actions.clear_selected_file_index();
    //set_input("");
    set_stdout("");
    set_error("");
  }

  return (
    <span>
      <SearchInput
        autoFocus={!IS_TOUCH}
        autoSelect={!IS_TOUCH}
        placeholder="Search or create file"
        value={file_search}
        on_change={on_change}
        on_submit={search_submit}
        on_up={on_up_press}
        on_down={on_down_press}
        on_clear={on_clear}
        disabled={disabled || !!ext_selection}
      />
      {render_file_creation_error()}
      {render_help_info()}
      <div style={output_style_searchbox}>
        {render_output(error, {
          color: "darkred",
          margin: 0,
        })}
        {render_output(stdout, { margin: 0 })}
      </div>
    </span>
  );
});
