/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// A single terminal frame.

import { Button, Tooltip } from "antd";
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
import useResizeObserver from "use-resize-observer";

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
    measureSize();
  }, [props.resize, resize]);

  function delete_terminal(): void {
    if (terminalRef.current == null) return; // already deleted or never created
    terminalRef.current.element?.remove();
    terminalRef.current.is_visible = false;
    terminalRef.current = undefined;
  }

  function init_terminal(): void {
    if (!props.is_visible) return;
    const node: any = terminalDOMRef.current;
    if (node == null) {
      // happens, e.g., when terminals are disabled.
      return;
    }
    terminalRef.current = props.actions._get_terminal(props.id, node);
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
    const command = props.desc.get("command");
    if (!command || command.endsWith("bash")) return;
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
        <Tooltip
          title={`Exit ${command} -- back to terminal`}
          placement="bottom"
        >
          <Button
            size="small"
            type="text"
            style={{ float: "right", paddingBottom: "2.5px" }}
            onClick={() => {
              props.actions.shell(props.id, { command: "bash" });
            }}
          >
            Exit
          </Button>
        </Tooltip>
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
        <div className={"smc-vfill cocalc-xtermjs"} ref={terminalDOMRef} />
      </div>
    </div>
  );
});
