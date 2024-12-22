import type {
  Location,
  CompactLocation,
  Comment,
  CompactComment,
} from "./types";

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
  const v: CompactLocation = [from.line, from.ch, to.line, to.ch];
  if (id != null) {
    v.push(id);
    if (field != null) {
      v.push(field);
    }
    return v;
  }
  if (field == null) {
    return v;
  }
  v.push(id);
  v.push(field);
  return v;
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

const FIELDS = ["id", "loc", "time", "hash", "created", "done"];

export function toCompactComment(x: Partial<Comment>): Partial<CompactComment> {
  const y: any = {};
  for (const field of FIELDS) {
    if (x[field] != null) {
      y[field[0]] = field == "loc" ? toCompactLocation(x[field]) : x[field];
    }
  }
  return y;
}

export function toComment(x: CompactComment): Comment {
  const { i, l, t, h, c, d } = x;
  return { id: i, loc: toLocation(l), time: t, hash: h, created: c, done: d };
}

