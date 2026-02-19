/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// A single terminal frame.

import { Map } from "immutable";
import { throttle } from "lodash";
import {
  CSS,
  React,
  Rendered,
  useEffect,
  useIsMountedRef,
  useRef,
} from "@cocalc/frontend/app-framework";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { Terminal } from "./connected-terminal";
import { background_color } from "./themes";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import useResizeObserver from "use-resize-observer";
import useComputeServerId from "@cocalc/frontend/compute/file-hook";
import { termPath } from "@cocalc/util/terminal/names";
import { normalizeArgs } from "./normalize-args";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_state: any;
  is_current: boolean;
  terminal?: Map<string, any>;
  desc: Map<string, any>;
  resize: number;
  is_visible: boolean;
  name: string;
}

const COMMAND_STYLE = {
  borderBottom: "1px solid grey",
  paddingLeft: "5px",
  background: "rgb(248, 248, 248)",
  height: "20px",
  overflow: "hidden",
} as CSS;

export const TerminalFrame: React.FC<Props> = React.memo((props: Props) => {
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const terminalDOMRef = useRef<any>(null);
  const resize = useResizeObserver({ ref: terminalDOMRef });
  const isMountedRef = useIsMountedRef();
  const student_project_functionality = useStudentProjectFunctionality(
    props.project_id,
  );

  const node = props.actions._get_frame_node(props.id);
  const frameType = props.desc.get("type");
  const command = props.desc.get("command");
  const shellNeedsKernel = frameType === "shell" && !command;
  const computeServerId = useComputeServerId({
    project_id: props.project_id,
    path: termPath({
      path: props.path,
      number: node.get("number"),
      cmd: node.get("command"),
    }),
  });

  useEffect(() => {
    return delete_terminal; // clean up on unmount
  }, []);

  useEffect(() => {
    if (terminalRef.current != null) {
      terminalRef.current.is_visible = props.is_visible;
    }
    // We *only* init the terminal if it is visible
    // or switches to being visible and was not initialized.
    // See https://github.com/sagemathinc/cocalc/issues/5133
    if (terminalRef.current != null || !props.is_visible) return;
    init_terminal();
  }, [props.is_visible]);

  useEffect(() => {
    // yes, this can change!! -- see https://github.com/sagemathinc/cocalc/issues/3819
    if (terminalRef.current == null) return;
    delete_terminal();
    init_terminal();
  }, [props.id]);

  // When the command or args change (e.g. frame type switched from
  // terminal to shell, or kernel connection_file updated on restart),
  // the old terminal process is no longer valid.  close_terminal() in
  // the TerminalManager removes the old instance, so we need to
  // reinitialize to pick up the new command/args from the frame tree.
  // We stringify args for stable comparison (it can be an Immutable List).
  // Always delete the stale terminal ref even if hidden — otherwise the
  // visibility effect (above) will see a non-null ref and skip reinit
  // when the frame becomes visible again.
  const argsKey = JSON.stringify(normalizeArgs(props.desc.get("args")));
  useEffect(() => {
    // command/type transitions can happen while no terminal instance exists
    // (e.g. shell frame showing "Kernel not running"). In that case, we still
    // must initialize once command/type becomes runnable and frame is visible.
    if (terminalRef.current != null) {
      delete_terminal();
    }
    if (props.is_visible) {
      init_terminal();
    }
    // If hidden, the visibility useEffect will call init_terminal()
    // when the frame becomes visible (terminalRef.current is now null).
  }, [frameType, command, argsKey]);

  useEffect(() => {
    if (props.is_current) {
      terminalRef.current?.focus();
    }
  }, [props.is_current]);

  useEffect(() => {
    measureSize();
  }, [props.resize, resize]);

  function delete_terminal(): void {
    if (terminalRef.current == null) return; // already deleted or never created
    terminalRef.current.element?.remove();
    terminalRef.current.is_visible = false;
    // Ignore size for this terminal.
    terminalRef.current.conn_write({ cmd: "size", rows: 0, cols: 0 });
    terminalRef.current = undefined;
  }

  function init_terminal(): void {
    if (shellNeedsKernel) return;
    if (!props.is_visible) return;
    const node: any = terminalDOMRef.current;
    if (node == null) {
      // happens, e.g., when terminals are disabled.
      return;
    }
    try {
      terminalRef.current = props.actions._get_terminal(props.id, node);
    } catch (err) {
      return; // not yet ready -- might be ok; will try again.
    }
    if (terminalRef.current == null) return; // should be impossible.
    terminalRef.current.is_visible = true;
    set_font_size();
    measureSize();
    if (props.is_current) {
      terminalRef.current.focus();
    }
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable ..
    // Well, this context menu is still silly. Always disable it.
    $(node).on("contextmenu", function () {
      return false;
    });

    // terminalRef.current.scroll_to_bottom();
  }

  const set_font_size = throttle(() => {
    if (terminalRef.current == null || !isMountedRef.current) {
      return;
    }
    if (terminalRef.current.getOption("fontSize") !== props.font_size) {
      terminalRef.current.set_font_size(props.font_size);
      measureSize();
    }
  }, 200);

  useEffect(set_font_size, [props.font_size]);

  function measureSize(): void {
    if (isMountedRef.current) {
      terminalRef.current?.measureSize();
    }
  }

  function render_command(): Rendered {
    if (!command) return;
    const args = normalizeArgs(props.desc.get("args")).map((arg) =>
      /\s/.test(arg) ? `"${arg}"` : arg,
    );
    return (
      <div style={COMMAND_STYLE}>
        {command} {args.join(" ")}
      </div>
    );
  }

  function render_shell_needs_kernel(): Rendered {
    if (!shellNeedsKernel) return;
    return (
      <div style={{ margin: "auto", fontSize: "14pt", padding: "15px" }}>
        <div>Kernel not running.</div>
        <div>Run a notebook cell to start the kernel and connect console.</div>
      </div>
    );
  }

  if (student_project_functionality.disableTerminals) {
    return (
      <b style={{ margin: "auto", fontSize: "14pt", padding: "15px" }}>
        Terminals are currently disabled in this project. Please contact your
        instructor if you have questions.
      </b>
    );
  }

  const backgroundColor = background_color(props.terminal?.get("color_scheme"));
  /* 4px padding is consistent with CodeMirror */

  return (
    <div className={"smc-vfill"}>
      {computeServerId != null && (
        <ComputeServerDocStatus
          id={computeServerId}
          project_id={props.project_id}
        />
      )}
      {render_command()}
      <div
        className={"smc-vfill"}
        style={{ backgroundColor, padding: "0 0 0 4px" }}
        onClick={() => {
          // Focus on click, since otherwise, clicking right outside term de-focusses,
          // which is confusing.
          terminalRef.current?.focus();
        }}
      >
        {shellNeedsKernel ? (
          render_shell_needs_kernel()
        ) : (
          <div className={"smc-vfill cocalc-xtermjs"} ref={terminalDOMRef} />
        )}
      </div>
    </div>
  );
});
