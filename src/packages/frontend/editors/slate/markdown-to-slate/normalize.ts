import { createEditor, Descendant, Editor } from "slate";
import { withNormalize } from "../normalize";
import { withIsInline, withIsVoid } from "../plugins";

// Make an editor that we'll use for normalizing.  It's important that it
// has exactly the plugins relevant to normalizing, but nothing else.
const editor = withNormalize(withIsInline(withIsVoid(createEditor())));

export default function normalize(children: Descendant[]) {
  //console.log("about to normalize..."); //, JSON.stringify(children));
  editor.children = children;
  Editor.normalize(editor);
  // console.log("after normalize:"); //, JSON.stringify(editor.children));
  return editor.children;
}

// Ensure that the array children starts and ends with a Text node.
// Mutates children in place.
export function ensureTextStartAndEnd(children: Descendant[]) {
  if (children[children.length - 1]?.["text"] == null) {
    children.push({ text: "" });
  }
  if (children[0]?.["text"] == null) {
    children.unshift({ text: "" });
  }
}
