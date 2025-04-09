/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { debounce } from "lodash";
import {
  CSS,
  redux,
  useActions,
  useEffect,
  useIsMountedRef,
  usePrevious,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ConnectionStatus } from "@cocalc/frontend/app/store";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { DEFAULT_TERM_ENV } from "@cocalc/frontend/frame-editors/code-editor/const";
import { Terminal } from "@cocalc/frontend/frame-editors/terminal-editor/connected-terminal";
import { ConnectedTerminalInterface } from "@cocalc/frontend/frame-editors/terminal-editor/connected-terminal-interface";
import { background_color } from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import { escapeBashChangeDirPath } from "@cocalc/util/jupyter-api/chdir-commands";
import { sha1 } from "@cocalc/util/misc";
import { FLYOUT_PADDING } from "./consts";

interface TerminalFlyoutProps {
  project_id: string;
  font_size: number;
  resize: number;
  is_visible: boolean;
  setConectionStatus: (status: ConnectionStatus | "") => void;
  heightPx: string;
  setTerminalFontSize: (f: (size: number) => number) => void;
  setTerminalTitle: (title: string) => void;
  syncPath: number;
  sync: boolean;
}

// This is modeled after frame-editors/terminal-editor/terminal.tsx
export function TerminalFlyout({
  project_id,
  font_size,
  resize,
  is_visible,
  setConectionStatus,
  heightPx,
  setTerminalFontSize,
  setTerminalTitle,
  syncPath,
  sync,
}: TerminalFlyoutProps) {
  const actions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");
  const currentPathRef = useRef<string>(current_path);
  const account_id = useTypedRedux("account", "account_id");
  const terminal = useTypedRedux("account", "terminal");
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const terminalDOMRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useIsMountedRef();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const syncRef = useRef<boolean>(sync);
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");

  useEffect(() => {
    currentPathRef.current = current_path;
  }, [current_path]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // Design decision:
  // One terminal per project, one for each user, and persistent across flyout open/close.
  // However, if the "current_path" changes, we update the terminal's cwd and vice versa.
  // The last aspect is why it is per user, not one terminal for everyone.
  // Also, having a different terminal for each directory is a bit confusing.
  // We do have a different one for each compute server though.
  const hash = sha1(`${project_id}::${account_id}::${compute_server_id}`);
  const terminal_path = `/tmp/cocalc-${hash}.term`;
  const id = `flyout::${hash}`; // TODO what exactly is the ID? arbitrary or a path?
  useEffect(() => {
    if (compute_server_id) {
      redux.getProjectActions(project_id).setComputeServerIdForFile({
        path: terminal_path,
        compute_server_id,
        confirm: false,
      });
    }
  }, [terminal_path]);

  function delete_terminal(): void {
    if (terminalRef.current == null) return; // already deleted or never created
    setConectionStatus("");
    terminalRef.current.element?.remove();
    terminalRef.current.is_visible = false;
    // Ignore size for this terminal.
    terminalRef.current.conn_write({ cmd: "size", rows: 0, cols: 0 });
    terminalRef.current.close();
    terminalRef.current = undefined;
  }

  function getMockTerminalActions(): ConnectedTerminalInterface {
    // NOTE: this object captures the initial state and does not react to changes
    // That's why there are some references and functional state updates in play.
    return {
      project_id,
      path: terminal_path,
      get_term_env() {
        return DEFAULT_TERM_ENV;
      },
      set_title(_id, title) {
        setTerminalTitle(title);
      },
      set_connection_status(_id, status) {
        setConectionStatus(status);
      },
      pause() {},
      unpause() {},
      set_status(mesg) {
        setStatus(mesg);
      },
      set_error(mesg) {
        setError(mesg);
      },
      decrease_font_size() {
        setTerminalFontSize((prev) => prev - 1);
      },
      increase_font_size() {
        setTerminalFontSize((prev) => prev + 1);
      },
      set_terminal_cwd(_id, payload) {
        if (!syncRef.current) return;
        // ignored, default location
        if (payload === "/tmp") return;
        if (currentPathRef.current != payload) {
          const next =
            payload.charAt(0) === "/" ? ".smc/root" + payload : payload;
          actions?.set_current_path(next);
        }
      },
      _tree_is_single_leaf() {
        // makes no sense, though
        return true;
      },
      close_frame() {}, // we use this terminal exclusively
      _get_project_actions() {
        return actions ?? redux.getProjectActions(project_id);
      },
      open_code_editor_frame(opts: {
        path: string;
        dir?;
        first?: boolean;
        pos?: number;
        compute_server_id?: number;
      }) {
        // we just open the file
        actions?.open_file({
          path: opts.path,
          compute_server_id: opts.compute_server_id,
        });
      },
    };
  }

  function getTerminal(id: string, parent: HTMLElement): Terminal {
    const newTerminal = new Terminal(
      getMockTerminalActions() as any, // this is "fine" because of the shared ConnectedTerminalInterface
      0,
      id,
      parent,
      undefined,
      undefined,
      "", // cwd=home directory, we'll send cd commands later
    );
    newTerminal.connect();
    return newTerminal;
  }

  function init_terminal(): void {
    if (!is_visible) return;
    const node = terminalDOMRef.current;
    if (node == null) {
      // happens, e.g., when terminals are disabled.
      return;
    }
    try {
      terminalRef.current = getTerminal(id, node);
    } catch (err) {
      return; // not yet ready -- might be ok
    }
    if (terminalRef.current == null) return; // should be impossible.
    terminalRef.current.is_visible = true;
    set_font_size();
    measure_size();
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable ..
    // Well, this context menu is still silly. Always disable it.
    $(node).on("contextmenu", function () {
      return false;
    });

    terminalRef.current.scroll_to_bottom();
  }

  useEffect(() => {
    return delete_terminal; // clean up on unmount
  }, []);

  useEffect(() => {
    if (terminalRef.current != null) {
      terminalRef.current.is_visible = is_visible;
    }
    // We *only* init the terminal if it is visible
    // or switches to being visible and was not initialized.
    // See https://github.com/sagemathinc/cocalc/issues/5133
    if (terminalRef.current != null || !is_visible) return;
    init_terminal();
  }, [is_visible]);

  useEffect(() => {
    // defensive, like with the frame terminal -- see https://github.com/sagemathinc/cocalc/issues/3819
    if (terminalRef.current == null) return;
    delete_terminal();
    init_terminal();
  }, [id]);

  // resize is a counter, increases with debouncing, if size change.
  // This triggers a re-measure of the terminal size, number of cols/rows changes.
  // Also trigger if status or error is displayed, since that changes the size.
  useEffect(() => {
    measure_size();
  }, [resize, status, error, heightPx]);

  const prevSyncPath = usePrevious(syncPath);

  // the terminal follows changing the directory
  useEffect(() => {
    if (terminalRef.current == null) return;
    if (syncPath === prevSyncPath && !sync) return;
    // this "line reset" is from the terminal guide,
    // see frame-editors/terminal-editor/actions::run_command
    const clean = "\x05\x15"; // move cursor to end of line, then clear line
    const nextCwd = escapeBashChangeDirPath(current_path);
    // start with a space to avoid recording in history
    const cmd = ` cd "$HOME/${nextCwd}"`;
    // this will end up in a write buffer, hence it should be ok to do right at the beginning
    terminalRef.current.conn_write(`${clean}${cmd}\n`);
  }, [current_path, syncPath, sync]);

  const set_font_size = debounce(
    () => {
      if (terminalRef.current == null || !isMountedRef.current) {
        return;
      }
      if (terminalRef.current.getOption("fontSize") !== font_size) {
        terminalRef.current.set_font_size(font_size);
        measure_size();
      }
    },
    200,
    { leading: false, trailing: true },
  );

  useEffect(set_font_size, [font_size]);

  function measure_size(): void {
    if (isMountedRef.current) {
      terminalRef.current?.measure_size();
    }
  }

  if (student_project_functionality.disableTerminals) {
    return (
      <b style={{ margin: "auto", fontSize: "14pt", padding: "15px" }}>
        Terminals are currently disabled in this project. Please contact your
        instructor if you have questions.
      </b>
    );
  }

  function renderStatusError() {
    const style: CSS = {
      fontSize: "12px",
      padding: FLYOUT_PADDING,
      margin: "0px",
    };
    if (error) {
      return (
        <Alert banner closable type="error" message={error} style={style} />
      );
    } else if (status) {
      return (
        <Alert banner closable type="info" message={status} style={style} />
      );
    }
  }

  const backgroundColor = background_color(terminal.get("color_scheme"));

  return (
    <div
      style={{
        flex: "1 0 auto",
        display: "flex",
        flexDirection: "column",
        backgroundColor,
        padding: "0",
      }}
      onClick={() => {
        // Focus on click, since otherwise, clicking right outside term defocuses,
        // which is confusing.
        terminalRef.current?.focus();
      }}
    >
      {renderStatusError()}
      <div
        style={{
          flex: "1 0 auto",
          background: backgroundColor,
          height: heightPx,
        }}
        className={"cocalc-xtermjs"}
        ref={terminalDOMRef}
      />
    </div>
  );
}
