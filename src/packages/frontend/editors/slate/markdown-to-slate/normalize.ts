import { createEditor, Editor } from "slate";
import { withNormalize } from "../normalize";

// note -- this is VERY, ridiculously slow in general.
// I don't really understand why it is so slow.
export default function normalize(children) {
  console.log("about to normalize...");
  const editor = withNormalize(createEditor());
  editor.children = children;
  Editor.normalize(editor, { force: true });
  console.log("after normalize:");
  return editor.children;
}
