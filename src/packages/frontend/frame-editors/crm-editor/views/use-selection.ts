import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useEditor, Actions } from "../actions";
import { Set } from "immutable";

export interface Selection {
  has: (key: any) => boolean;
  add: (key: any) => void;
  delete: (key: any) => void;
}

export default function useSelection(viewId: string): Selection {
  const { actions } = useFrameContext<Actions>();
  const editor = useEditor();
  const sel = editor("selection");

  return {
    has: (key) => !!sel?.get(viewId)?.has(key),
    delete: (key) => {
      const s = sel?.get(viewId);
      if (s == null) return;
      actions.setState({ selection: sel.set(viewId, s.delete(key)) });
    },
    add: (key) => {
      let s = sel?.get(viewId);
      if (s == null) {
        s = Set([]);
      }
      actions.setState({ selection: sel.set(viewId, s.add(key)) });
    },
  };
}
