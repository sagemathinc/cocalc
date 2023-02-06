import { useState } from "react";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { useFrameContext } from "../whiteboard-editor/hooks";

const PLACEHOLDER = "Speaker notes";

export default function SpeakerNotes() {
  const { /*actions,*/ isFocused } = useFrameContext();
  const [value, setValue] = useState<string>("");
  if (isFocused) {
    return (
      <div className="smc-vfill">
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
