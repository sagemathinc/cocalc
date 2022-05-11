export const withIsVoid = (editor) => {
  const { isVoid } = editor;

  editor.isVoid = (element) => {
    if (element === editor) return false;
    return element.isVoid != null ? element.isVoid : isVoid(element);
  };

  return editor;
};

export const withIsInline = (editor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.isInline != null ? element.isInline : isInline(element);
  };

  return editor;
};