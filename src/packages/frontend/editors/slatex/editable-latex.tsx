import { EditableMarkdown } from "../slate/editable-markdown";
//import sourceToSlate from "./latex-to-slate";
//import slateToSource from "./slate-to-latex";
import { slate_to_markdown as slateToSource } from "../slate/slate-to-markdown";
import { markdown_to_slate as sourceToSlate } from "../slate/markdown-to-slate";

export default function EditableLatex(props) {
  return (
    <EditableMarkdown
      {...props}
      sourceToSlate={sourceToSlate}
      slateToSource={slateToSource}
    />
  );
}
