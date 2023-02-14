/*
Hook for doing selection using checkboxes,
with support for select all and shift click.

This is actually fairly generic and has little
to do with CRM.  It should perhaps be refactored
out, along with the selectable-index component.

The selection state is stored in the redux store
for this editor.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useEditor, Actions } from "../actions";
import { Set } from "immutable";
import { useRef, useState } from "react";

export interface Selection {
  has: (key: any) => boolean;
  add: (key: any, index: number, shiftKey?: boolean) => void;
  delete: (key: any) => void;
  setAll: (state: boolean) => void;
  all: boolean;
  size: number;
}

interface Options {
  id: string;
  getKey: (index: number) => any; // 0 based
  size: number;
}
export default function useSelection({ id, getKey, size }: Options): Selection {
  const { actions } = useFrameContext<Actions>();
  const [all, setAll] = useState<boolean>(false);
  const editor = useEditor();
  const sel = editor("selection");
  const lastAddRef = useRef<number | null>(null);

  return {
    has: (key) => !!sel?.get(id)?.has(key),
    delete: (key) => {
      let s = sel?.get(id);
      if (s == null) return;
      s = s.delete(key);
      actions.setState({ selection: sel.set(id, s) });
      if (s.size < size) {
        setAll(false);
      }
    },
    add: (key, index, shiftKey: boolean = false) => {
      let s = sel?.get(id);
      if (s == null) {
        s = Set([]);
      }
      s = s.add(key);
      if (shiftKey && lastAddRef.current != null) {
        for (
          let n = Math.min(lastAddRef.current, index);
          n <= Math.max(lastAddRef.current, index);
          n++
        ) {
          s = s.add(getKey(n));
        }
      }
      actions.setState({ selection: sel.set(id, s) });
      if (s.size == size) {
        setAll(true);
      }
      lastAddRef.current = index;
    },
    setAll: (checked: boolean) => {
      if (checked) {
        const v: any[] = [];
        for (let n = 0; n < size; n++) {
          v.push(getKey(n));
        }
        actions.setState({ selection: sel.set(id, Set(v)) });
        setAll(true);
      } else {
        // delete all
        actions.setState({ selection: sel.delete(id) });
        setAll(false);
      }
    },
    all,
    size,
  };
}
