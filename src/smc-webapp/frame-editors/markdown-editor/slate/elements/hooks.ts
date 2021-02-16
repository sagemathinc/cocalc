/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { useFocused, useSelected, useSlate } from "../slate-react";

import {
  ReactDOM,
  useEffect,
  useRef,
  useActions as useReduxActions,
} from "../../../../app-framework";
import { Range } from "slate";
import { useSlate } from "../slate-react";
import { path_split } from "smc-util/misc";
import { Actions } from "../../actions";

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
    const { project_id, path } = (editor as any).cocalc_context;
    (elt as any).process_smc_links({
      project_id,
      file_path: path_split(path).head, // TODO: inefficient to compute this every time.
    });
  }, deps);
  return ref;
};

// The actions for the ambient markdown editor; we just hang this
// on the useSlate context.  The right way is to write our own
// context-based useActions hook of course, which would be useful
// all over the place!
export function useActions(): Actions {
  const editor = useSlate();
  const { project_id, path } = (editor as any).cocalc_context;
  return useReduxActions(project_id, path);
}

export function useID(): string {
  const editor = useSlate();
  return (editor as any).cocalc_context.id;
}
