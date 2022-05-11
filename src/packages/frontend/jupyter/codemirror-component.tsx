/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

*/

import { React, useIsMountedRef, useRef, useState } from "../app-framework";
import { Map as ImmutableMap } from "immutable";
import { all_fields_equal } from "@cocalc/util/misc";
import { CodeMirrorEditor } from "./codemirror-editor";
import { CodeMirrorStatic } from "./codemirror-static";
import { JupyterActions } from "./browser-actions";

interface CodeMirrorProps {
  actions?: JupyterActions;
  id: string;
  options: ImmutableMap<string, any>;
  value: string;
  font_size?: number; // not explicitly used, but critical to re-render on change so Codemirror recomputes itself!
  is_focused: boolean;
  cursors?: ImmutableMap<any, any>;
  complete?: ImmutableMap<any, any>;
  is_scrolling?: boolean;
  registerEditor?;
  unregisterEditor?;
  getValueRef?;
}

function should_memoize(prev, next) {
  return all_fields_equal(prev, next, [
    "id",
    "options",
    "value",
    "font_size",
    "is_focused",
    "is_scrolling",
    "cursors",
    "complete",
  ]);
}

export const CodeMirror: React.FC<CodeMirrorProps> = React.memo(
  (props: CodeMirrorProps) => {
    const {
      actions,
      id,
      options,
      value,
      font_size,
      is_focused,
      cursors,
      complete,
      is_scrolling,
      registerEditor,
      unregisterEditor,
      getValueRef,
    } = props;

    const is_mounted = useIsMountedRef();

    // coordinates if static input was just clicked on
    const [click_coords, set_click_coords] = useState<any>();

    // last cursor position when editing
    const [last_cursor, set_last_cursor_state] = useState<any>();

    // For some reason the static renderer has some REALLY bad performance, especially for
    // larger documents.  This may be an issue with using react at all (i.e., we should just
    // directly generate html).  For now, probably the best fix is not to use the static
    // renderer, since it causes so much trouble...
    // See https://github.com/sagemathinc/cocalc/issues/3652
    // Instead, we should optimize how the normal render works, e.g., by caching it.

    const has_rendered_nonstatic = useRef<boolean>(false);

    function set_last_cursor(pos: any) {
      if (is_mounted.current) {
        // ignore unless mounted -- can still get called due to caching of cm editor
        set_last_cursor_state(pos);
      }
    }

    // Regarding IS_TOUCH, see https://github.com/sagemathinc/cocalc/issues/2584 -- fix that properly and then
    // we can remove this use of the slower non-static fallback...
    if ((has_rendered_nonstatic.current || !is_scrolling) && actions != null) {
      has_rendered_nonstatic.current = true;
      return (
        <CodeMirrorEditor
          actions={actions}
          id={id}
          options={options}
          value={value}
          font_size={font_size}
          cursors={cursors}
          click_coords={click_coords}
          set_click_coords={set_click_coords}
          set_last_cursor={set_last_cursor}
          last_cursor={last_cursor}
          is_focused={is_focused}
          is_scrolling={is_scrolling}
          complete={complete}
          registerEditor={registerEditor}
          unregisterEditor={unregisterEditor}
          getValueRef={getValueRef}
        />
      );
    } else {
      has_rendered_nonstatic.current = false;
      return (
        <CodeMirrorStatic
          id={id}
          options={options?.toJS()}
          value={value}
          font_size={font_size}
          set_click_coords={set_click_coords}
        />
      );
    }
  },
  should_memoize
);
