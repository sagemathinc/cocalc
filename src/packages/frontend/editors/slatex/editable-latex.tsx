import { EditableMarkdown } from "../slate/editable-markdown";
import sourceToSlate from "./latex-to-slate/parse";
import slateToSource from "./slate-to-latex";

export default function EditableLatex(props) {
  return (
    <EditableMarkdown
      {...props}
      style={{ fontFamily: '"Computer Modern Serif", serif' }}
      sourceToSlate={sourceToSlate}
      slateToSource={slateToSource}
    />
  );
}
