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
import { useEffect, useRef, MutableRefObject } from "react";
const { codemirror_editor } = require("@cocalc/frontend/editor");
const { SynchronizedWorksheet } = require("@cocalc/frontend/sagews/sagews");
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  doc;
  path: string;
  project_id: string;
  font_size: number;
}

export function SagewsCodemirror({ doc, path, project_id, font_size }: Props) {
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
    viewDocRef.current = codemirror_editor(project_id, path, opts);
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

    const f = (value: string): void => {
      if (viewDocRef.current == null) {
        return;
      }
      cmRef.current?.setValueNoJump(value);
      worksheet.process_sage_updates();
    };
    f(doc.to_str());
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
    updateRef.current?.(doc.to_str());
    viewDocRef.current?.set_font_size(cmRef.current, font_size);
    cmRef.current?.refresh();
  }, [font_size, doc, isVisible]);

  return (
    <div className="smc-vfill" style={{ overflow: "auto" }}>
      <div ref={divRef} />
    </div>
  );
}
