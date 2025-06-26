/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export { useFocused, useSelected } from "../slate-react";

import {
  useEffect,
  useFrameContext,
  useRef,
} from "@cocalc/frontend/app-framework";
import { Range } from "slate";
import { path_split } from "@cocalc/util/misc";
import { useSlateStatic as useSlateStatic0 } from "../slate-react";
import { SlateEditor } from "../editable-markdown";

// Exactly like the normal useSlate hook, except return type is
// SlateEditor, which we know since we're only using this in CoCalc
// where we only use our enhanced type.
// NOTE: for elements *ONLY* useSlateStatic is actually provided,
// since useSlate would force every element that uses it to update
// on every editor change, which is no good.
export const useSlate = () => {
  return useSlateStatic0() as SlateEditor;
};

export const useSlateStatic = () => {
  return useSlateStatic0() as SlateEditor;
};

// Whether or not the current selection exists and is collapsed (i.e., not
// a range).
export const useCollapsed = () => {
  const editor = useSlate();
  return editor.selection != null && Range.isCollapsed(editor.selection);
};

export const useProcessLinks = (
  deps: (string | undefined)[],
  { doubleClick } = { doubleClick: false },
) => {
  // TODO: implementation is very ugly!
  const ref = useRef<any>(null);
  const { project_id, path } = useFrameContext();
  useEffect(() => {
    if (ref.current == null) return;
    const elt = $(ref.current);
    (elt as any).process_smc_links({
      project_id,
      file_path: path_split(path).head, // TODO: inefficient to compute this every time.
      doubleClick,
    });
  }, deps);
  return ref;
};
