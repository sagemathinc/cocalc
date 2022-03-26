import { createEditor, Editor } from "slate";
import { withNormalize } from "../normalize";
import { withIsInline, withIsVoid } from "../plugins";

// Make an editor that we'll use for normalizing.  It's important that it
// has exactly the plugins relevant to normalizing, but nothing else.
const editor = withNormalize(withIsInline(withIsVoid(createEditor())));

export default function normalize(children) {
  //console.log("about to normalize..."); //, JSON.stringify(children));
  editor.children = children;
  Editor.normalize(editor);
  // console.log("after normalize:"); //, JSON.stringify(editor.children));
  return editor.children;
}
