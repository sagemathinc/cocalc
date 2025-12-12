/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Lightweight accessors that work with plain objects (Immer) and Immutable.js
// maps while we migrate fully to plain data.

type MaybeGetter = { get?: (k: string) => any };

export function field<T = any>(obj: any, key: string): T | undefined {
  if (obj == null) return undefined;
  if (typeof (obj as MaybeGetter).get === "function") {
    return (obj as MaybeGetter).get!(key) as T;
  }
  return (obj as any)[key] as T;
}

export function historyArray(msg: any): any[] {
  const h = field<any>(msg, "history");
  if (h == null) return [];
  if (Array.isArray(h)) return h;
  if (typeof (h as any)?.toArray === "function") {
    return (h as any)
      .toArray()
      .map((e: any) => (typeof e?.toJS === "function" ? e.toJS() : e));
  }
  if (typeof (h as any)?.toJS === "function") return (h as any).toJS();
  return [];
}

export function firstHistory(msg: any): any | undefined {
  const h = historyArray(msg);
  return h.length > 0 ? h[0] : undefined;
}

export function dateValue(msg: any): Date | undefined {
  const d = field<any>(msg, "date");
  if (d instanceof Date) return d;
  if (typeof d === "string" || typeof d === "number") {
    const dt = new Date(d);
    return isNaN(dt.valueOf()) ? undefined : dt;
  }
  return undefined;
}

export function senderId(msg: any): string | undefined {
  return field<string>(msg, "sender_id");
}

export function replyTo(msg: any): string | undefined {
  return field<string>(msg, "reply_to");
}

// Return list of account IDs currently editing the message.
export function editingArray(msg: any): string[] {
  const e = field<any>(msg, "editing");
  if (e == null) return [];
  // Immutable Map
  if (typeof (e as any)?.keySeq === "function") {
    return (e as any).keySeq().toArray();
  }
  // Immutable Set / List
  if (typeof (e as any)?.toArray === "function") {
    return (e as any).toArray();
  }
  // Immutable Map via toJS
  if (typeof (e as any)?.toJS === "function") {
    return Object.keys((e as any).toJS());
  }
  // Plain object
  if (typeof e === "object") {
    return Object.keys(e);
  }
  return [];
}

export function foldingList(msg: any): any {
  const f = field<any>(msg, "folding");
  if (f == null) return [];
  if (Array.isArray(f)) return f;
  if (typeof (f as any)?.toArray === "function") return (f as any).toArray();
  if (typeof (f as any)?.toJS === "function") return (f as any).toJS();
  return f;
}
