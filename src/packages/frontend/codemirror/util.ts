export function getFoldedLines(cm): number[] {
  return cm
    .getAllMarks()
    .filter((mark) => mark.__isFold)
    .map((mark) => mark.find().from.line);
}

export function setFoldedLines(cm, lines: number[]) {
  for(const n of lines) {
    cm.foldCode(n);
  }
}
