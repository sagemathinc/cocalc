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
      history.push(elt.value);
    }
  }
  return history;
}
