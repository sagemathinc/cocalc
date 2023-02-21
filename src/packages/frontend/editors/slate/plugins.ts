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
    // NOTE: we can't just check that element.isInline is not null, since element could be
    // the whole editor, which has an inline *method*, which is not null, but also not a boolean.
    // See https://github.com/sagemathinc/cocalc/issues/6394
    return typeof element.isInline == "boolean"
      ? element.isInline
      : isInline(element);
  };

  return editor;
};
