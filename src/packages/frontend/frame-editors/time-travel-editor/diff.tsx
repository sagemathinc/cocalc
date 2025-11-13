/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render a diff of two versions of a document for use in TimeTravel.

NOTE: I did extensively test out using https://github.com/praneshr/react-diff-viewer.
Though it seems reasonably mature and has some work done on it, building on other great
tools, it is has some major show-stopper limitations, e.g., it doesn't support large documents
via windowing. Also, I had a lot of css conflicts trying to use it (it just looked very wrong,
and it uses tables)  Codemirror automatically supports large documents, editor themes, etc.,
so we build something on Codemirror instead
*/

import * as CodeMirror from "codemirror";
import { debounce } from "lodash";
import { MutableRefObject, useEffect, useRef } from "react";

import { AccountState } from "@cocalc/frontend/account/types";
import { cm_options } from "../codemirror/cm-options";
import { init_style_hacks } from "../codemirror/util";
import { set_cm_line_diff } from "./diff-util";

interface Props {
  v0: string;
  v1: string;
  path: string; // filename of doc, which determines what sort of syntax highlighting to use.
  editor_settings: AccountState["editor_settings"];
  font_size: number;
  use_json: boolean;
}

export function Diff(props: Props) {
  const updateRef = useRef<Function>(null) as MutableRefObject<Function>;
  const cmRef = useRef<CodeMirror.Editor | null>(
    null,
  ) as MutableRefObject<CodeMirror.Editor | null>;
  const textAreaRef = useRef<any>(null);

  const initCodemirror = () => {
    const textarea = textAreaRef.current;
    if (textarea == null) return; // can't happen
    const options: any = cm_options(
      props.use_json ? "a.js" : props.path,
      props.editor_settings,
    );
    options.readOnly = true;
    cmRef.current = CodeMirror.fromTextArea(textarea, options);
    init_style_hacks(cmRef.current);
    set_cm_line_diff(cmRef.current, props.v0, props.v1);
    const f = (v0: string, v1: string): void => {
      if (cmRef.current == null) return;
      set_cm_line_diff(cmRef.current, v0, v1);
    };
    updateRef.current = debounce(f, 300);
  };

  useEffect(() => {
    initCodemirror();
    return () => {
      if (cmRef.current == null) return;
      $(cmRef.current.getWrapperElement()).remove();
      cmRef.current = null;
    };
  }, []);

  useEffect(() => {
    updateRef.current?.(props.v0, props.v1);
    cmRef.current?.refresh();
  }, [props.v0, props.v1]);

  return (
    <div
      className="smc-vfill"
      style={{ fontSize: `${props.font_size}px`, overflow: "auto" }}
    >
      <textarea ref={textAreaRef} style={{ display: "none" }} />
    </div>
  );
}
