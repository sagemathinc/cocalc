/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { throttle } from "lodash";

import {
  ReactDOM,
  useActions,
  useCallback,
  useEffect,
  useIsMountedRef,
  useRef,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { Terminal } from "@cocalc/frontend/frame-editors/terminal-editor/connected-terminal";
import { background_color } from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import { sha1 } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { escapeBashChangeDirPath } from "@cocalc/util/jupyter-api/chdir-commands";

// This is modeled after frame-editors/terminal-editor/terminal.tsx
export function TerminalFlyout({
  project_id,
  font_size,
  resize,
  is_visible,
  setConectionStatus,
}) {
  const actions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");
  const account_id = useTypedRedux("account", "account_id");
  const terminal = useTypedRedux("account", "terminal");
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const terminalDOMRef = useRef<any>(null);
  const isMountedRef = useIsMountedRef();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  // Design decision:
  // One terminal per project, one for each user, and persistent across flyout open/close.
  // However, if the "current_path" changes, we update the terminal's cwd and vice versa.
  // The last aspect is why it is per user, not one terminal for everyone.
  // Also, having a different terminal for each directory is a bit confusing.
  const hash = sha1(`${project_id}::${account_id}`);
  const terminal_path = `/tmp/cocalc/${hash}.term`;
  const id = `flyout::${hash}`; // TODO what exactly is the ID? arbitrary or a path?

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

  function get_terminal(id: string, parent: HTMLElement): Terminal {
    const mockActions = {
      project_id,
      terminal_path,
      get_term_env() {
        return {};
      },
      flag_file_activity() {},
      set_title(_id, _title) {},
      set_connection_status(_id, status) {
        setConectionStatus(status);
      },
      decrease_font_size() {},
      increase_font_size() {},
      set_terminal_cwd(_id, payload) {
        if (current_path != payload) {
          actions?.set_current_path(payload);
        }
      },
    };
    const newTerminal = new Terminal(
      mockActions as any,
      0,
      id,
      parent,
      "bash",
      []
    );
    newTerminal.connect();
    return newTerminal;
  }

  function init_terminal(): void {
    if (!is_visible) return;
    const node: any = ReactDOM.findDOMNode(terminalDOMRef.current);
    if (node == null) {
      // happens, e.g., when terminals are disabled.
      return;
    }
    try {
      terminalRef.current = get_terminal(id, node);
    } catch (err) {
      return; // not yet ready -- might be ok
    }
    if (terminalRef.current == null) return; // should be impossible.
    terminalRef.current.is_visible = true;
    set_font_size();
    measure_size();
    terminalRef.current.focus();
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
    terminalRef.current?.focus();
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
  useEffect(() => {
    measure_size();
  }, [resize]);

  // the terminal follows changing the directory
  useEffect(() => {
    if (terminalRef.current == null) return;
    // this "line reset" is from the terminal guide,
    // see frame-editors/terminal-editor/actions::run_command
    const clean = "\x05\x15"; // move cursor to end of line, then clear line
    const cmd = `cd "$HOME/${escapeBashChangeDirPath(current_path)}"`;
    // this will end up in a write buffer, hence it should be ok to do right at the beginning
    terminalRef.current.conn_write(`${clean}${cmd}\n`);
  }, [current_path]);

  const set_font_size = useCallback(
    throttle(() => {
      if (terminalRef.current == null || !isMountedRef.current) {
        return;
      }
      if (terminalRef.current.getOption("fontSize") !== font_size) {
        terminalRef.current.set_font_size(font_size);
        measure_size();
      }
    }, 200),
    []
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
      <div
        style={{
          flex: "1 0 auto",
          background: COLORS.GRAY_LLL,
          height: "200px",
        }}
        className={"cocalc-xtermjs"}
        ref={terminalDOMRef}
      />
    </div>
  );
}
