/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Flex } from "antd";
import React, { useMemo } from "react";
import { useIntl } from "react-intl";

import { CSS, redux } from "@cocalc/frontend/app-framework";
import { Icon, SearchInput } from "@cocalc/frontend/components";
import { HelpAlert } from "@cocalc/frontend/project/explorer/file-listing/help-alert";
import { TerminalModeDisplay } from "@cocalc/frontend/project/explorer/file-listing/terminal-mode-display";
import { full_path_text } from "@cocalc/frontend/project/explorer/file-listing/utils";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_to_file } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../context";
import { isTerminalMode } from "./file-listing";
import { ListingItem } from "./types";
import { SearchHistoryDropdown } from "./search-history-dropdown";
import { useExplorerSearchHistory } from "./use-search-history";

const HelpStyle: React.CSSProperties = {
  wordWrap: "break-word",
  top: "40px",
  position: "absolute",
  width: "100%",
  height: "38px",
  boxShadow: `${COLORS.GRAY_L} 6px 6px 6px`,
  zIndex: 100,
  borderRadius: "15px",
};

export const outputMinitermStyle: React.CSSProperties = {
  background: "var(--cocalc-bg-base, #fff)",
  position: "absolute",
  zIndex: 10,
  boxShadow: `-4px 4px 7px ${COLORS.GRAY_L}`,
  maxHeight: "450px",
  overflow: "auto",
  right: 0,
  marginTop: "36px",
  marginRight: "5px",
  borderRadius: "5px",
  width: "100%",
};

interface Props {
  file_search: string;
  current_path?: string;
  actions: ProjectActions;
  create_file: (ext?: string, switch_over?: boolean) => void;
  create_folder: (switch_over?: boolean) => void;
  selected_file?: ListingItem; // if given, file selected by cursor, which we open on pressing enter
  selected_file_index?: number;
  file_creation_error?: string;
  num_files_displayed?: number;
  disabled?: boolean;
  ext_selection?: string;
  disabled_ext?: string[];
  on_blur?: () => void;
  on_focus?: () => void;
  /** Called when a terminal command (prefixed with /) finishes executing. */
  onTerminalCommand?: () => void;
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
    disabled_ext,
  } = props;

  const intl = useIntl();
  const { project_id } = useProjectContext();
  const {
    history,
    initialized: historyInitialized,
    addHistoryEntry,
  } = useExplorerSearchHistory(project_id);

  // TODO use state/set_state to show a progress spinner while a command runs
  const [, set_state] = React.useState<"edit" | "run">("edit");
  const [error, set_error] = React.useState<string | undefined>(undefined);
  const [stdout, set_stdout] = React.useState<string | undefined>(undefined);
  const [historyMode, setHistoryMode] = React.useState(false);
  const [historyIndex, setHistoryIndex] = React.useState(0);

  const inputFocusedRef = React.useRef(false);
  const previousSearchRef = React.useRef(file_search);
  const skipNextClearHistoryRef = React.useRef(false);

  const _id = React.useRef<number>(0);
  const [cmd, set_cmd] = React.useState<
    { input: string; id: number } | undefined
  >(undefined);

  React.useEffect(() => {
    if (!historyMode) return;
    if (history.length === 0) {
      setHistoryMode(false);
      setHistoryIndex(0);
      return;
    }
    if (historyIndex >= history.length) {
      setHistoryIndex(history.length - 1);
    }
  }, [history, historyIndex, historyMode]);

  React.useEffect(() => {
    const prev = previousSearchRef.current;
    if (prev === file_search) {
      return;
    }
    previousSearchRef.current = file_search;

    if (file_search.length > 0) {
      return;
    }

    if (!prev) {
      return;
    }

    if (skipNextClearHistoryRef.current) {
      skipNextClearHistoryRef.current = false;
      return;
    }

    // If search text is cleared after focus left the input, assume it was
    // used via click/directory navigation and save it.
    if (!inputFocusedRef.current) {
      addHistoryEntry(prev);
    }
  }, [addHistoryEntry, file_search]);

  React.useEffect(() => {
    if (cmd == null) return;
    // Open the listing pass-through latch BEFORE the command runs,
    // so filesystem updates triggered by the command are shown immediately.
    props.onTerminalCommand?.();
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

  const actualNewFilename = useMemo(() => {
    if (file_search.length === 0) return "";
    return full_path_text(file_search, disabled_ext ?? []);
  }, [file_search, disabled_ext]);

  function render_help_info(): React.JSX.Element | undefined {
    if (historyMode) {
      return;
    }
    if (isTerminalMode(file_search)) {
      return <TerminalModeDisplay style={HelpStyle} />;
    }
    if (file_search.length > 0) {
      return (
        <div
          style={{
            position: "absolute",
            top: "40px",
            width: "100%",
            zIndex: 100,
          }}
        >
          <HelpAlert
            file_search={file_search}
            actual_new_filename={actualNewFilename}
          />
        </div>
      );
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
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              display: "flex",
              justifyContent: "flex-end",
              pointerEvents: "none",
            }}
          >
            <a
              onClick={(e) => {
                e.preventDefault();
                set_stdout("");
                set_error("");
              }}
              href=""
              style={{
                color: COLORS.GRAY_M,
                fontSize: "14pt",
                background: "var(--cocalc-bg-base, #fff)",
                pointerEvents: "auto",
                padding: "0 5px",
              }}
            >
              <Icon name="times" />
            </a>
          </div>
          <pre style={{ margin: 0, ...style }}>{x}</pre>
        </div>
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
    if (historyMode) {
      apply_history_selection();
      return;
    }
    if (current_path == null) {
      return;
    }
    if (isTerminalMode(value)) {
      const command = value.slice(1, value.length);
      if (command.trim().length > 0) {
        addHistoryEntry(value);
      }
      execute_command(command);
    } else if (selected_file) {
      addHistoryEntry(value);
      const new_path = path_to_file(current_path, selected_file.name);
      const opening_a_dir = selected_file.isdir;
      if (opening_a_dir) {
        actions.open_directory(new_path);
      } else {
        actions.open_file({
          path: new_path,
          foreground: !ctrl_down,
        });
      }
      if (opening_a_dir || !ctrl_down) {
        skipNextClearHistoryRef.current = true;
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
    if (!historyMode && historyInitialized && history.length > 0) {
      setHistoryMode(true);
      setHistoryIndex(0);
      return;
    }
    if (historyMode) {
      setHistoryIndex((idx) => Math.max(idx - 1, 0));
      return;
    }
    if (selected_file_index > 0) {
      actions.decrement_selected_file_index();
    }
  }

  function on_down_press(): void {
    if (historyMode) {
      setHistoryIndex((idx) =>
        Math.min(idx + 1, Math.max(0, history.length - 1)),
      );
      return;
    }
    if (selected_file_index < num_files_displayed - 1) {
      actions.increment_selected_file_index();
    }
  }

  function on_change(search: string): void {
    setHistoryMode(false);
    setHistoryIndex(0);
    actions.zero_selected_file_index();
    actions.set_file_search(search);
  }

  function on_escape(): boolean {
    if (!historyMode) {
      return false;
    }
    setHistoryMode(false);
    setHistoryIndex(0);
    return true;
  }

  function apply_history_selection(idx?: number): void {
    const value = history[idx ?? historyIndex];
    setHistoryMode(false);
    setHistoryIndex(0);
    if (value == null) {
      return;
    }
    actions.zero_selected_file_index();
    actions.set_file_search(value);
  }

  function on_focus(): void {
    inputFocusedRef.current = true;
    props.on_focus?.();
  }

  function on_blur(): void {
    inputFocusedRef.current = false;
    setHistoryMode(false);
    setHistoryIndex(0);
    props.on_blur?.();
  }

  function on_clear(): void {
    // Save the current search to history before clearing — the user
    // explicitly dismissed it, which counts as "used".
    if (file_search) {
      addHistoryEntry(file_search);
      skipNextClearHistoryRef.current = true;
    }
    setHistoryMode(false);
    setHistoryIndex(0);
    actions.clear_selected_file_index();
    set_stdout("");
    set_error("");
  }

  function render_history_dropdown(): React.JSX.Element | undefined {
    if (!historyMode || history.length === 0) {
      return;
    }
    return (
      <SearchHistoryDropdown
        history={history}
        historyIndex={historyIndex}
        setHistoryIndex={setHistoryIndex}
        onSelect={apply_history_selection}
      />
    );
  }

  return (
    <Flex style={{ flex: "1 0 auto", position: "relative" }} vertical={true}>
      <SearchInput
        autoFocus
        autoSelect
        placeholder={intl.formatMessage({
          id: "project.explorer.search-bar.placeholder",
          defaultMessage: 'Filter files or "!" or "/" for Terminal...',
        })}
        value={file_search}
        on_change={on_change}
        on_submit={search_submit}
        on_up={on_up_press}
        on_down={on_down_press}
        on_clear={on_clear}
        on_escape={on_escape}
        on_blur={on_blur}
        on_focus={on_focus}
        disabled={disabled || !!ext_selection}
        status={
          file_search.length > 0 && !isTerminalMode(file_search)
            ? "warning"
            : undefined
        }
      />
      {render_file_creation_error()}
      {render_history_dropdown()}
      {render_help_info()}
      <div style={{ ...outputMinitermStyle, width: "100%", left: 0 }}>
        {render_output(error, {
          color: COLORS.FG_RED,
          margin: 0,
        })}
        {render_output(stdout, { margin: 0 })}
      </div>
    </Flex>
  );
});
