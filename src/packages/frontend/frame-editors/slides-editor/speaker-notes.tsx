import { useMemo, useState } from "react";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { useFrameContext } from "../whiteboard-editor/hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import type { State } from "./actions";

const PLACEHOLDER = "Speaker notes";

export default function SpeakerNotes() {
  const { /*actions,*/ project_id, path, isFocused, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });

  //const is_loaded = useEditor("is_loaded");
  const readOnly = useEditor("read_only");
  const sortedPageIds = useEditor("sortedPageIds");

  const pageId = useMemo(() => {
    if (sortedPageIds == null) return null;
    const pageNumber = desc.get("page");
    return sortedPageIds.get(pageNumber - 1);
  }, [desc.get("page"), sortedPageIds]);

  const speakerNotes = useEditor("speakerNotes");
  const element = useMemo(() => speakerNotes?.get(pageId)?.toJS(), [pageId]);

  const [value, setValue] = useState<string>("");
  if (!readOnly && isFocused) {
    return (
      <div className="smc-vfill">
        page = {pageId}
        {JSON.stringify(element)}
        <MultiMarkdownInput
          height={"100%"}
          value={value}
          onChange={(value) => {
            setValue(value);
          }}
          placeholder={PLACEHOLDER}
        />
      </div>
    );
  } else {
    return (
      <MostlyStaticMarkdown
        style={{ margin: "15px", overflow: "auto" }}
        value={!value ? PLACEHOLDER : value}
        onChange={(value) => {
          console.log("value = ", value);
          setValue(value);
        }}
      />
    );
  }
}
