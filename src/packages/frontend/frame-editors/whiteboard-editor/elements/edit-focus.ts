import { useEffect, useState } from "react";
import { useFrameContext } from "../hooks";

export default function useEditFocus(
  init: boolean = false
): [boolean, (state: boolean) => void] {
  const { actions, id: frameId, desc } = useFrameContext();
  const [editFocus, setEditFocus0] = useState<boolean>(init);
  const setEditFocus = (state: boolean) => {
    setEditFocus0(state);
    actions.setEditFocus(frameId, state);
  };
  useEffect(() => {
    if (editFocus != desc.get("editFocus")) {
      setEditFocus0(desc.get("editFocus"));
    }
  }, [desc.get("editFocus")]);

  useEffect(() => {
    if (init) {
      setEditFocus(true);
    }
  }, []);

  return [editFocus, setEditFocus];
}
