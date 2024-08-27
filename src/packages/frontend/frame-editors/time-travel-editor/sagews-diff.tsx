/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is just going to be a horible wrapper around the ancient complicated
code to get this done for now.
*/

import { debounce } from "lodash";
import * as CodeMirror from "codemirror";
import { Map } from "immutable";
import { useEffect, useRef, MutableRefObject } from "react";
import { set_cm_line_diff } from "./diff-util";
const { codemirror_editor } = require("../../editor");
const { SynchronizedWorksheet } = require("../../sagews/sagews");
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  v0: string;
  v1: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_settings: Map<string, any>;
}

export function SagewsDiff(props: Props) {
  const { isVisible } = useFrameContext();
  const updateRef = useRef<Function>(null) as MutableRefObject<Function>;
  const cmRef = useRef<CodeMirror.Editor | null>(
    null,
  ) as MutableRefObject<CodeMirror.Editor | null>;
  const viewDocRef = useRef<any>(null);
  const divRef = useRef<any>(null);

  const initSagews = (): void => {
    const div = divRef.current;
    if (div == null) {
      // this better not happen
      return;
    }

    const opts = { mode: "sagews", read_only: true };
    viewDocRef.current = codemirror_editor(props.project_id, props.path, opts);
    cmRef.current = viewDocRef.current.codemirror;
    // insert it into the dom.
    $(viewDocRef.current.element).appendTo($(div));
    // remove the second codemirror editor
    $(viewDocRef.current.codemirror1.getWrapperElement()).remove();

    const opts0 = {
      allow_javascript_eval: false,
      static_viewer: true,
    };
    const worksheet = new SynchronizedWorksheet(viewDocRef.current, opts0);

    const f = (v0: string, v1: string): void => {
      if (viewDocRef.current == null || cmRef.current == null) {
        return;
      }
      set_cm_line_diff(cmRef.current, v0, v1);
      worksheet.process_sage_updates();
    };
    f(props.v0, props.v1);
    updateRef.current = debounce(f, 100);
  };

  useEffect(() => {
    initSagews();
    return () => {
      if (viewDocRef.current == null) {
        return;
      }
      viewDocRef.current.remove();
    };
  }, []);

  useEffect(() => {
    updateRef.current?.(props.v0, props.v1);
    viewDocRef.current?.set_font_size(cmRef.current, props.font_size);
    cmRef.current?.refresh();
  }, [props.font_size, isVisible, props.v0, props.v1]);

  return (
    <div className="smc-vfill" style={{ overflow: "auto" }}>
      <div ref={divRef} />
    </div>
  );
}
