import type { Location, CompactLocation, Mark, CompactMark } from "./types";

export function getLocation(mark): null | Location {
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

export function toCompactLocation(r: Location): CompactLocation {
  const { from, to, id, field } = r;
  return [from.line, from.ch, to.line, to.ch, id, field];
}

export function toLocation(c: CompactLocation): Location {
  const [fromLine, fromCh, toLine, toCh, id, field] = c;
  return {
    from: { line: fromLine, ch: fromCh },
    to: { line: toLine, ch: toCh },
    id,
    field,
  };
}

export function toCompactMark(x: Mark): CompactMark {
  const { id, loc, time, hash, created, done } = x;
  return {
    i: id,
    l: toCompactLocation(loc),
    t: time,
    h: hash,
    c: created,
    d: done,
  };
}

export function toMark(x: CompactMark): Mark {
  const { i, l, t, h, c, d } = x;
  return { id: i, loc: toLocation(l), time: t, hash: h, created: c, done: d };
}
