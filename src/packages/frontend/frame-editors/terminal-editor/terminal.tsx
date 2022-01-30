/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// A single terminal frame.

import { Map } from "immutable";
import { Terminal } from "./connected-terminal";
import { throttle } from "lodash";
import { background_color } from "./themes";
import {
  CSS,
  React,
  Rendered,
  ReactDOM,
  useEffect,
  useIsMountedRef,
  useRef,
} from "../../app-framework";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_state: any;
  is_current: boolean;
  terminal: Map<string, any>;
  desc: Map<string, any>;
  resize: number;
  is_visible: boolean;
}

const COMMAND_STYLE = {
  borderBottom: "1px solid grey",
  paddingLeft: "5px",
  background: "rgb(248, 248, 248)",
  height: "20px",
  overflow: "hidden",
} as CSS;

export const TerminalFrame: React.FC<Props> = React.memo((props) => {
  const divRef = useRef<any>(null);
  usePinchToZoom({ target: divRef });
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const terminalDOMRef = useRef<any>(null);
  const isMountedRef = useIsMountedRef();
  const student_project_functionality = useStudentProjectFunctionality(
    props.project_id
  );

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

  useEffect(() => {
    if (props.is_current) {
      terminalRef.current?.focus();
    }
  }, [props.is_current]);

  useEffect(() => {
    measure_size();
  }, [props.resize]);

  function delete_terminal(): void {
    if (terminalRef.current == null) return; // already deleted or never created
    terminalRef.current.element?.remove();
    terminalRef.current.is_visible = false;
    // Ignore size for this terminal.
    terminalRef.current.conn_write({ cmd: "size", rows: 0, cols: 0 });
    terminalRef.current = undefined;
  }

  function init_terminal(): void {
    if (!props.is_visible) return;
    const node: any = ReactDOM.findDOMNode(terminalDOMRef.current);
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
    measure_size();
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

    terminalRef.current.scroll_to_bottom();
  }

  const set_font_size = throttle(() => {
    if (terminalRef.current == null || !isMountedRef.current) {
      return;
    }
    if (terminalRef.current.getOption("fontSize") !== props.font_size) {
      terminalRef.current.set_font_size(props.font_size);
      measure_size();
    }
  }, 300);

  useEffect(set_font_size, [props.font_size]);

  function measure_size(): void {
    if (isMountedRef.current) {
      terminalRef.current?.measure_size();
    }
  }

  function render_command(): Rendered {
    const command = props.desc.get("command");
    if (!command) return;
    const args: string[] = props.desc.get("args") ?? [];
    // Quote if args have spaces:
    for (let i = 0; i < args.length; i++) {
      if (/\s/.test(args[i])) {
        // has whitespace -- this is not bulletproof, since
        // args[i] could have a " in it. But this is just for
        // display purposes, so it doesn't have to be bulletproof.
        args[i] = `"${args[i]}"`;
      }
    }
    return (
      <div style={COMMAND_STYLE}>
        {command} {args.join(" ")}
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

  const backgroundColor = background_color(props.terminal.get("color_scheme"));
  /* 4px padding is consistent with CodeMirror */
  return (
    <div className={"smc-vfill"}>
      {render_command()}
      <div
        ref={divRef}
        className={"smc-vfill"}
        style={{ backgroundColor, padding: "0 0 0 4px" }}
        onClick={() => {
          // Focus on click, since otherwise, clicking right outside term defocuses,
          // which is confusing.
          terminalRef.current?.focus();
        }}
      >
        <div className={"smc-vfill cocalc-xtermjs"} ref={terminalDOMRef} />
      </div>
    </div>
  );
});
