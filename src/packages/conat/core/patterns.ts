/*


*/

type Index = { [pattern: string]: Index | string };

export class Patterns<T> {
  private patterns: { [pattern: string]: T } = {};
  private index: Index = {};
  constructor() {}

  *matches(subject: string) {
    for (const pattern in this.patterns) {
      if (matchesPattern(pattern, subject)) {
        yield pattern;
      }
    }
  }

  get = (pattern: string): T | undefined => {
    return this.patterns[pattern];
  };

  matchUsingIndex = (subject: string): string[] => {
    return matchUsingIndex(this.index, subject.split("."));
  };

  set = (pattern: string, t: T) => {
    this.patterns[pattern] = t;
    const segments = pattern.split(".");
    setIndex(this.index, segments, pattern);
  };

  delete = (pattern: string) => {
    delete this.patterns[pattern];
  };
}

function setIndex(index: Index, segments: string[], pattern) {
  if (segments.length == 0) {
    index[""] = pattern;
    return;
  }
  const v = index[segments[0]];
  if (v === undefined) {
    const idx: Index = {};
    setIndex(idx, segments.slice(1), pattern);
    index[segments[0]] = idx;
    return;
  }
  if (typeof v == "string") {
    // already set
    return;
  }
  setIndex(v, segments.slice(1), pattern);
}

// todo deal with >
function matchUsingIndex(index: Index, segments: string[]): string[] {
  if (segments.length == 0) {
    const p = index[""];
    if (p === undefined) {
      return [];
    } else if (typeof p === "string") {
      return [p];
    } else {
      throw Error("bug");
    }
  }
  const matches: string[] = [];
  const subject = segments[0];
  // [ ] todo -- handle special case of pattern = '>'
  for (const pattern of ["*", ">", subject]) {
    if (index[pattern] !== undefined) {
      const p = index[pattern];
      if (typeof p == "string") {
        matches.push(p);
      } else {
        for (const s of matchUsingIndex(p, segments.slice(1))) {
          matches.push(s);
        }
      }
    }
  }
  return matches;
}

export function matchesSegment(pattern, subject): boolean {
  if (pattern == "*" || pattern == ">") {
    return true;
  }
  return pattern == subject;
}

export function matchesPattern(pattern, subject): boolean {
  const subParts = subject.split(".");
  const patParts = pattern.split(".");
  let i = 0,
    j = 0;
  while (i < subParts.length && j < patParts.length) {
    if (patParts[j] === ">") return true;
    if (patParts[j] !== "*" && patParts[j] !== subParts[i]) return false;
    i++;
    j++;
  }

  return i === subParts.length && j === patParts.length;
}
