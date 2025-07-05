import { isEqual } from "lodash";
import { getLogger } from "@cocalc/conat/client";
import { EventEmitter } from "events";

type Index = { [pattern: string]: Index | string };

const logger = getLogger("pattern");

export class Patterns<T> extends EventEmitter {
  private patterns: { [pattern: string]: T } = {};
  private index: Index = {};

  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  close = () => {
    this.emit("closed");
    this.patterns = {};
    this.index = {};
  };

  serialize = (fromT?: (x: T) => any) => {
    let patterns: { [pattern: string]: any };
    if (fromT != null) {
      patterns = {};
      for (const pattern in this.patterns) {
        patterns[pattern] = fromT(this.patterns[pattern]);
      }
    } else {
      patterns = this.patterns;
    }

    return { patterns, index: this.index };
  };

  deserialize = (
    { patterns, index }: { patterns: { [pattern: string]: any }; index: Index },
    toT?: (x: any) => T,
  ) => {
    if (toT != null) {
      for (const pattern in patterns) {
        patterns[pattern] = toT(patterns[pattern]); // make it of type T
      }
    }
    this.patterns = patterns;
    this.index = index;
    this.emit("change");
  };

  // mutate this by merging in data from p.
  merge = (p: Patterns<T>) => {
    for (const pattern in p.patterns) {
      const t = p.patterns[pattern];
      this.set(pattern, t);
    }
    this.emit("change");
  };

  matches = (subject: string): string[] => {
    return matchUsingIndex(this.index, subject.split("."));
  };

  // return true if there is at least one match
  hasMatch = (subject: string): boolean => {
    return matchUsingIndex(this.index, subject.split("."), true).length > 0;
  };

  hasPattern = (pattern: string): boolean => {
    return this.patterns[pattern] !== undefined;
  };

  matchesTest = (subject: string): string[] => {
    const a = this.matches(subject);
    const b = this.matchNaive(subject);
    a.sort();
    b.sort();
    if (!isEqual(a, b)) {
      logger.debug("BUG in PATTERN MATCHING!!!", {
        subject,
        a,
        b,
        index: this.index,
        patterns: Object.keys(this.patterns),
      });
    }
    return b;
  };

  matchNaive = (subject: string): string[] => {
    const v: string[] = [];
    for (const pattern in this.patterns) {
      if (matchesPattern(pattern, subject)) {
        v.push(pattern);
      }
    }
    return v;
  };

  get = (pattern: string): T | undefined => {
    return this.patterns[pattern];
  };

  set = (pattern: string, t: T) => {
    this.patterns[pattern] = t;
    setIndex(this.index, pattern.split("."), pattern);
    this.emit("change");
  };

  delete = (pattern: string) => {
    delete this.patterns[pattern];
    deleteIndex(this.index, pattern.split("."));
  };
}

function setIndex(index: Index, segments: string[], pattern) {
  if (segments.length == 0) {
    index[""] = pattern;
    return;
  }
  if (segments[0] == ">") {
    // there can't be anything after it
    index[">"] = pattern;
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

function deleteIndex(index: Index, segments: string[]) {
  const ind = index[segments[0]];
  if (ind === undefined) {
    return;
  }
  if (typeof ind != "string") {
    deleteIndex(ind, segments.slice(1));
    // if there is anything still stored in ind
    // besides ind[''], we do NOT delete it.
    for (const key in ind) {
      if (key != "") {
        return;
      }
    }
  }
  delete index[segments[0]];
}

// todo deal with >
function matchUsingIndex(
  index: Index,
  segments: string[],
  atMostOne = false,
): string[] {
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
  for (const pattern of ["*", ">", subject]) {
    if (index[pattern] !== undefined) {
      const p = index[pattern];
      if (typeof p == "string") {
        // end of this pattern -- matches if segments also
        // stops *or* this pattern is >
        if (segments.length == 1) {
          matches.push(p);
          if (atMostOne) {
            return matches;
          }
        } else if (pattern == ">") {
          matches.push(p);
          if (atMostOne) {
            return matches;
          }
        }
      } else {
        for (const s of matchUsingIndex(p, segments.slice(1), atMostOne)) {
          matches.push(s);
          if (atMostOne) {
            return matches;
          }
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
