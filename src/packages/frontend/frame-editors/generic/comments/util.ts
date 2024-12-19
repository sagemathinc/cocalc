
export function getPos(mark) {
  const x = mark.find();
  if (x == null) {
    return null;
  }
  const { from, to } = x;
  return {
    from: { ch: from.ch, line: from.line },
    to: { ch: to.ch, line: to.line },
  };
}
