// Get history for the given element in the editor.
// UGLY thing: if we can't find element in editor, then we return null.
// This DOES happen and also means we have to walk the entire children array.
// This works fine since a moment later this gets called with everything in sync again.
// NOTE: we are also assuming fenced code blocks are at the top level always, which
// is questionable.
export function getHistory(editor, element): string[] | null {
  const history: string[] = [];
  if (editor == null) return history;
  for (const elt of editor.children) {
    if (elt === element) {
      return history;
    }
    if (
      elt.type == "code_block" &&
      elt.fence == true &&
      elt.info == element.info
    ) {
      const value = elt.value?.trim();
      if (value) {
        history.push(value);
      }
    }
  }
  return null;
}

export function isPreviousSiblingCodeBlock(editor, element): boolean {
  if (editor == null) return false;
  let foundElement = false;
  for (let i = 0; i < editor.children.length; i++) {
    const elt = editor.children[i];
    if (elt === element) {
      foundElement = true;
      if (i > 0 && editor.children[i - 1].type === "code_block") {
        return true;
      }
    } else if (foundElement) {
      break;
    }
  }
  return false;
}
