/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { useIsMountedRef, useMemo, useState } from "smc-webapp/app-framework";
import { Marks } from "./component";
import { Editor } from "slate";
import { ReactEditor } from "../slate-react";

function getMarks(editor) {
  try {
    return Editor.marks(editor) ?? {};
  } catch (err) {
    // If the selection is at a non-leaf node somehow,
    // then marks aren't defined and raises an error.
    //console.log("Editor.marks", err);
    return {};
  }
}

export const useMarks = (editor) => {
  const isMountedRef = useIsMountedRef();

  const [marks, setMarks] = useState<Marks>(getMarks(editor));

  const updateMarks = useMemo(() => {
    const f = () => {
      if (!isMountedRef.current) return;
      // NOTE: important to debounce, and that this update happens
      // sometime in the near future and not immediately on any change!
      // Don't do it in the update loop where it is requested
      // since that causes issues, e.g.., try to move cursor out
      // of a code block.
      if (!ReactEditor.isFocused(editor)) {
        setMarks({});
      } else {
        setMarks(getMarks(editor));
      }
    };
    // We debounce to avoid any potential performance implications while
    // typing and for the reason mentioned in the NOTE above.  leading=false
    // is the default, but I just want to be very clear about that below.
    return debounce(f, 200, { leading: false });
  }, []);

  return { marks, updateMarks };
};
