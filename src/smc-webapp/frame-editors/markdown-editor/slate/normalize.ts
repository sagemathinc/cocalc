import { Editor, Element, Transforms } from "slate";

export const withNormalize = (editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    // If the element is a paragraph, ensure its children are valid.
    if (Element.isElement(node) && node.type === "list_item") {
      const [parent] = Editor.parent(editor, path);
      if (
        !Element.isElement(parent) ||
        (parent.type != "bullet_list" && parent.type != "ordered_list")
      ) {
        // invalid document: every list_item should be in a list.
        Transforms.wrapNodes(editor, { type: "bullet_list" } as Element, {
          at: path,
        });
      }
    }

    // Fall back to the original `normalizeNode` to enforce other constraints.
    normalizeNode(entry);
  };

  return editor;
};
