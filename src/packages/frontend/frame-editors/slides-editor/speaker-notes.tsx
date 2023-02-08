import { useEffect, useMemo } from "react";
import { useFrameContext } from "../whiteboard-editor/hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import type { State } from "./actions";
import { TextEditor } from "../whiteboard-editor/elements/text";

const PLACEHOLDER = "Speaker notes";

export default function SpeakerNotes() {
  const {
    actions,
    project_id,
    path,
    isFocused,
    desc,
    id: frameId,
  } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const sortedPageIds = useEditor("sortedPageIds");

  // initialize page info for this frame.
  useEffect(() => {
    actions.setPages(frameId, actions.store.get("pages")?.size ?? 1);
    actions.setPage(frameId, desc.get("page") ?? 1);
  }, []);

  const pageId = useMemo(() => {
    if (sortedPageIds == null) return null;
    const pageNumber = desc.get("page");
    return sortedPageIds.get(pageNumber - 1);
  }, [desc.get("page"), sortedPageIds]);

  const speakerNotes = useEditor("speakerNotes");
  const element = useMemo(() => {
    if (!pageId) return null;
    let cur = speakerNotes?.get(pageId)?.toJS();
    if (cur == null) {
      // will create this note.
      setTimeout(() => {
        cur = actions.createElement(undefined, {
          type: "speaker_notes",
          page: pageId,
          invisible: true,
          str: "",
        });
      }, 0);
    }
    return cur;
  }, [pageId, speakerNotes]);

  if (element == null) {
    return null;
  }
  return (
    <div className="smc-vfill" style={{ overflow: "auto" }}>
      <TextEditor
        element={element}
        canvasScale={1}
        focused={isFocused}
        markdownProps={{
          height: "100%",
          placeholder: PLACEHOLDER,
          fontSize: desc.get("font_size"),
        }}
      />
    </div>
  );
}
