export function getHistory(editor, element): string[] {
  const history: string[] = [];
  if (editor == null) return history;
  for (const elt of editor.children) {
    if (elt === element) {
      break;
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
  return history;
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
