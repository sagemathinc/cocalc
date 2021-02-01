/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { useFocused, useSelected, useSlate } from "../slate-react";

import { ReactDOM, useEffect, useRef } from "../../../../app-framework";
import { Range } from "slate";
import { useSlate } from "../slate-react";
import { path_split } from "smc-util/misc";

// Whether or not the current selection exists and is collapsed (i.e., not
// a range).
export const useCollapsed = () => {
  const editor = useSlate();
  return editor.selection != null && Range.isCollapsed(editor.selection);
};

export const useProcessLinks = (deps?) => {
  // TODO: implementation is very ugly!
  const ref = useRef<any>(null);
  const editor = useSlate();
  useEffect(() => {
    if (ref.current == null) return;
    const elt = $(ReactDOM.findDOMNode(ref.current));
    require("smc-webapp/process-links"); // ensure loaded
    (elt as any).process_smc_links({
      project_id: (editor as any).project_id,
      file_path: path_split((editor as any).path).head, // TODO: inefficient to compute this every time.
    });
  }, deps);
  return ref;
};
