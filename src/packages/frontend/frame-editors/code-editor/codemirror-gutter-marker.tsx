/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
React component that represents gutter markers in a codemirror editor.
*/

import { useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ReactNode } from "react";
import * as CodeMirror from "codemirror";
import { FrameContext } from "../frame-tree/frame-context";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  line: number; // line where it is initially placed -- will of course change as doc changes
  codemirror: CodeMirror.Editor; // codemirror editor instance that we'll put gutter marks in.
  gutter_id: string;
  set_handle: Function;
  children: ReactNode;
}

export function GutterMarker(props: Props) {
  const eltRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<CodeMirror.LineHandle | null>(null);
  const rootRef = useRef<any>(null);
  const frameContext = useFrameContext();

  useEffect(() => {
    const el = (eltRef.current = document.createElement("div"));
    const root = (rootRef.current = createRoot(el));
    root.render(
      <FrameContext.Provider value={frameContext}>
        <div>{props.children}</div>
      </FrameContext.Provider>,
    );

    const handle = (handleRef.current = props.codemirror.setGutterMarker(
      props.line,
      props.gutter_id,
      el,
    ));
    props.set_handle(handle);

    return () => {
      if (eltRef.current != null) {
        // Defer unmount to avoid race condition with React render cycle
        setTimeout(() => {
          rootRef.current?.unmount();
        }, 0);
        eltRef.current.remove();
        eltRef.current = null;
      }
      if (handleRef.current != null) {
        props.codemirror.setGutterMarker(
          handleRef.current,
          props.gutter_id,
          null,
        );
        handleRef.current = null;
      }
    };
  }, [props.line, props.gutter_id]);

  return null;
}
