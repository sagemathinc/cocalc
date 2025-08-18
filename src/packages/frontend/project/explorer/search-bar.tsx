/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Flex } from "antd";
import React from "react";
import { useIntl } from "react-intl";
import { CSS, redux } from "@cocalc/frontend/app-framework";
import { Icon, SearchInput } from "@cocalc/frontend/components";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_to_file } from "@cocalc/util/misc";
import { useProjectContext } from "../context";
import { TERM_MODE_CHAR } from "./file-listing";
import { ListingItem } from "./types";
import { TerminalModeDisplay } from "@cocalc/frontend/project/explorer/file-listing/terminal-mode-display";

const HelpStyle = {
  wordWrap: "break-word",
  top: "40px",
  position: "absolute",
  width: "100%",
  height: "38",
  boxShadow: "#999 6px 6px 6px",
  zIndex: 100,
  borderRadius: "15px",
} as const;

export const outputMinitermStyle: React.CSSProperties = {
  background: "white",
  position: "absolute",
  zIndex: 10,
  boxShadow: "-4px 4px 7px #aaa",
  maxHeight: "450px",
  overflow: "auto",
  right: 0,
  marginTop: "36px",
  marginRight: "5px",
  borderRadius: "5px",
  width: "100%",
} as const;

interface Props {
  file_search: string;
  current_path?: string;
  actions: ProjectActions;
  create_file: (a, b) => void;
  create_folder: (a) => void;
  selected_file?: ListingItem; // if given, file selected by cursor, which we open on pressing enter
  selected_file_index?: number;
  file_creation_error?: string;
  num_files_displayed?: number;
  disabled?: boolean;
  ext_selection?: string;
}

// Commands such as CD throw a setState error.
// Search WARNING to find the line in this class.
export const SearchBar = React.memo((props: Props) => {
  const {
    file_search = "",
    current_path,
    actions,
    create_file,
    create_folder,
    selected_file,
    selected_file_index = 0,
    file_creation_error,
    num_files_displayed = 0,
    disabled = false,
    ext_selection,
  } = props;

  const intl = useIntl();
  const { project_id } = useProjectContext();

  // edit → run → edit
  // TODO use "state" to show a progress spinner while a command is running
  // @ts-ignore
  const [state, set_state] = React.useState<"edit" | "run">("edit");
  const [error, set_error] = React.useState<string | undefined>(undefined);
  const [stdout, set_stdout] = React.useState<string | undefined>(undefined);

  const _id = React.useRef<number>(0);
  const [cmd, set_cmd] = React.useState<
    { input: string; id: number } | undefined
  >(undefined);

  React.useEffect(() => {
    if (cmd == null) return;
    const { input, id } = cmd;
    const input0 = input + '\necho $HOME "`pwd`"';
    const compute_server_id = redux
      .getProjectStore(project_id)
      ?.get("compute_server_id");
    webapp_client.exec({
      project_id,
      command: input0,
      timeout: 10,
      max_output: 100000,
      bash: true,
      path: current_path,
      err_on_exit: false,
      compute_server_id,
      filesystem: true,
      cb(err, output) {
        if (id !== _id.current) {
          // computation was canceled -- ignore result.
          return;
        }
        if (err) {
          set_error(JSON.stringify(err));
          set_state("edit");
        } else {
          if (output.stdout) {
            // Find the current path
            // after the command is executed, and strip
            // the output of "pwd" from the output:
            // NOTE: for compute servers which can in theory use a totally different HOME, this won't work.
            // However, by default on cocalc.com they use the same HOME, so it should work.
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
    _id.current = _id.current + 1;
    set_cmd({ input, id: _id.current });
  }

  function render_help_info(): React.JSX.Element | undefined {
    if (file_search[0] == TERM_MODE_CHAR) {
      return <TerminalModeDisplay style={HelpStyle} />;
    }
    if (file_search.length > 0 && num_files_displayed > 0) {
      let text;
      const firstFolderPosition = file_search.indexOf("/");
      if (file_search === " /") {
        text = "Showing all folders in this directory";
      } else if (firstFolderPosition === file_search.length - 1) {
        text = `Showing folders matching ${file_search.slice(
          0,
          file_search.length - 1,
        )}`;
      } else {
        text = `Showing files matching "${file_search}"`;
      }
      return <Alert style={HelpStyle} type="info" message={text} />;
    }
  }

  function render_file_creation_error(): React.JSX.Element | undefined {
    if (file_creation_error) {
      return (
        <Alert
          style={{ wordWrap: "break-word", marginBottom: "10px" }}
          type="error"
          closable
          onClose={dismiss_alert}
          message={file_creation_error}
        />
      );
    }
  }

  // Miniterm functionality
  function render_output(
    x: string | undefined,
    style: CSS,
  ): React.JSX.Element | undefined {
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
              background: "white",
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

  function search_submit(
    value: string,
    { ctrl_down, shift_down }: { ctrl_down: boolean; shift_down: boolean },
  ): void {
    if (current_path == null) {
      return;
    }
    if (value.startsWith(TERM_MODE_CHAR)) {
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
          foreground: !ctrl_down,
        });
      }
      if (opening_a_dir || !ctrl_down) {
        actions.set_file_search("");
        actions.clear_selected_file_index();
      }
    } else if (file_search.length > 0 && shift_down) {
      // only create a file, if shift is pressed as well to avoid creating
      // jupyter notebooks (default file-type) by accident.
      if (file_search[file_search.length - 1] === "/") {
        create_folder(!ctrl_down);
      } else {
        create_file(undefined, !ctrl_down);
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
    <Flex style={{ flex: "1 0 auto", position: "relative" }} vertical={true}>
      <SearchInput
        autoFocus
        autoSelect
        placeholder={intl.formatMessage({
          id: "project.explorer.search-bar.placeholder",
          defaultMessage: 'Filter files or "/" for terminal...',
        })}
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
      <div style={{ ...outputMinitermStyle, width: "100%", left: 0 }}>
        {render_output(error, {
          color: "darkred",
          margin: 0,
        })}
        {render_output(stdout, { margin: 0 })}
      </div>
    </Flex>
  );
});
