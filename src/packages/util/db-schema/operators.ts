/*
TODO: Postgres supports regular expressions and SIMILAR to:
https://www.postgresql.org/docs/current/functions-matching.html
However, there are significant performance implications
to using those.  Maybe restrict use of regexp to admins only?
*/
import LRU from "lru-cache";
import { unreachable } from "../misc";

// ORDER MATTERS! -- this gets looped over and searches happen -- so
// the 1-character ops must be after 2-character ops that contain them.
// This is ONLY used by the database (and for interaction with it).
export const OPERATORS = [
  "!=",
  "<>",
  "<=",
  ">=",
  "==",
  "<",
  ">",
  "=",
  "IS NOT",
  "IS",
  "ILIKE",
  "LIKE",
  "NOT ILIKE",
  "NOT LIKE",
  "ANY", // only array
  "MINLEN", // only array
  "MAXLEN", // only array
] as const;
export type Operator = (typeof OPERATORS)[number];

export function isToOperand(operand: string) {
  switch (`${operand}`.toLowerCase()) {
    case "null":
    case "undefined":
      return "null";
    case "unknown":
      return "unknown";
    case "true":
      return "true";
    case "false":
      return "false";
    default:
      return "true";
  }
}

export function opToFunction(op: Operator): (a, b) => boolean {
  switch (op) {
    case "=":
    case "==":
      return (a, b) => a === b;
    case "!=":
    case "<>":
      return (a, b) => a !== b;
    case "<=":
      return (a, b) => a <= b;
    case ">=":
      return (a, b) => a >= b;
    case "<":
      return (a, b) => a < b;
    case ">":
      return (a, b) => a > b;
    case "IS":
      return (a, b) => {
        // see https://www.postgresql.org/docs/current/functions-comparison.html
        switch (`${b}`.toLowerCase()) {
          case "null":
          case "undefined":
          case "unknown":
            return a == null;
          case "true":
            return !!a;
          case "false":
            return !a;
          default: // shouldn't happen
            return false;
        }
      };
    case "IS NOT": {
      const f = opToFunction("IS");
      return (a, b) => !f(a, b);
    }
    case "LIKE":
      return (a, b) => {
        const re = likeRegExp(b);
        return `${a}`.match(re) != null;
      };
    case "NOT LIKE": {
      const f = opToFunction("LIKE");
      return (a, b) => !f(a, b);
    }
    case "ILIKE":
      return (a, b) => {
        const re = likeRegExp(b, true);
        return `${a}`.match(re) != null;
      };
    case "NOT ILIKE": {
      const f = opToFunction("ILIKE");
      return (a, b) => !f(a, b);
    }
    case "ANY":
      return (a, b) => {
        if (!Array.isArray(b)) {
          return false;
        }
        return b.includes(a);
      };
    case "MINLEN":
      // array b has at least a entries
      return (a, b) => {
        if (!Array.isArray(b)) {
          return false;
        }
        return b.length >= a;
      };
    case "MAXLEN":
      // array b has at least a entries
      return (a, b) => {
        if (!Array.isArray(b)) {
          return false;
        }
        return b.length <= a;
      };
    default:
      unreachable(op);
      throw Error(`operator must be one of '${JSON.stringify(OPERATORS)}'`);
  }
}

// This is from
//    https://stackoverflow.com/questions/1314045/emulating-sql-like-in-javascript

const likeRegExpCache = new LRU<string, RegExp>({ max: 100 });

function likeRegExp(expression: string, caseInsensitive?: boolean): RegExp {
  const key = expression + `${caseInsensitive}`;
  if (likeRegExpCache.has(key)) {
    return likeRegExpCache.get(key) as RegExp;
  }
  const re = new RegExp(
    `^${expression
      .split(/(\[.+?\])/g)
      .map((s, i) =>
        i % 2
          ? s.replace(/\\/g, "\\\\")
          : s.replace(/[-\/\\^$*+?.()|[\]{}%_]/g, (m) => {
              switch (m) {
                case "%":
                  return ".*";
                case "_":
                  return ".";
                default:
                  return `\\${m}`;
              }
            }),
      )
      .join("")}$`,
    caseInsensitive ? "i" : "",
  );
  likeRegExpCache.set(key, re);
  return re;
}
