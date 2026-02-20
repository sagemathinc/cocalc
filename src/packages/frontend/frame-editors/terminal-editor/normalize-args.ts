/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Convert args from an Immutable.js List (or other iterable) to a plain string[].
 *
 * When frame tree node data is read via node.get("args"), the result is an
 * Immutable.js List rather than a plain array.  Downstream code (e.g. MsgPack
 * serialization over Conat) requires plain arrays, so we normalise here.
 */
export function normalizeArgs(rawArgs: unknown): string[];
export function normalizeArgs(
  rawArgs: unknown,
  allowUndefined: true,
): string[] | undefined;
export function normalizeArgs(
  rawArgs: unknown,
  allowUndefined?: boolean,
): string[] | undefined {
  if (rawArgs == null) {
    return allowUndefined ? undefined : [];
  }
  const iter = Array.isArray(rawArgs)
    ? rawArgs
    : typeof (rawArgs as any)?.toArray === "function"
      ? (rawArgs as any).toArray()
      : typeof (rawArgs as any)?.[Symbol.iterator] === "function"
        ? Array.from(rawArgs as Iterable<unknown>)
        : undefined;
  if (iter == null) {
    return allowUndefined ? undefined : [];
  }
  return iter.filter((arg): arg is string => typeof arg === "string");
}
