/*
 *  This file is part of CoCalc: Copyright (c) 2026 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

import { EventEmitter } from "node:events";
import { getLogger } from "@cocalc/backend/logger";
import type { QueryConfig } from "pg";
import { getPglite, closePglite } from "../pglite";
import { normalizeValues } from "./pg-utc-normalize";

const L = getLogger("db:pool:pglite");

type PgliteQueryResult = {
  rows: any[];
  fields?: { name: string; dataTypeID: number }[];
  affectedRows?: number;
};

type PgLikeResult = {
  rows: any[];
  fields?: { name: string; dataTypeID: number }[];
  rowCount?: number;
};

type AdvisoryWaiter = {
  sessionId: string;
  resolve: () => void;
};

type AdvisoryLock = {
  owner: string;
  count: number;
  waiters: AdvisoryWaiter[];
};

type QueryArgs =
  | [string]
  | [string, any[]]
  | [QueryConfig]
  | [QueryConfig, any];

const LOWLEVEL_DEBUG = Boolean(process.env.PGLITE_LOWLEVEL_DEBUG);
const SLOW_QUERY_MS = 3000;

function withLowlevelDebug<T>(
  label: string,
  text: string,
  values: any[] | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!LOWLEVEL_DEBUG) {
    return fn();
  }
  const err = new Error(`[pglite] slow query (${label})`);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(err, withLowlevelDebug);
  }
  const summary = {
    label,
    text: text.slice(0, 500),
    valuesCount: Array.isArray(values) ? values.length : 0,
  };
  const timer = setTimeout(() => {
    console.log(`[pglite] query running >${SLOW_QUERY_MS}ms`, summary);
    if (err.stack) {
      console.log(err.stack);
    }
  }, SLOW_QUERY_MS);
  return fn().finally(() => clearTimeout(timer));
}

export function isPgliteEnabled(): boolean {
  return process.env.COCALC_DB === "pglite";
}

function normalizeQueryArgs(args: QueryArgs): { text: string; values?: any[] } {
  if (typeof args[0] === "string") {
    return {
      text: args[0],
      values: Array.isArray(args[1]) ? normalizeValues(args[1]) : undefined,
    };
  }

  const cfg = args[0] as QueryConfig & { query?: string };
  const text =
    typeof cfg.text === "string"
      ? cfg.text
      : typeof cfg.query === "string"
        ? cfg.query
        : undefined;
  if (!text) {
    throw new Error("pglite: query config missing text");
  }
  const values = Array.isArray(cfg.values) ? normalizeValues(cfg.values) : undefined;
  return { text, values };
}

function parseQueryConfig(
  textOrConfig: string | (QueryConfig & { query?: string }),
  valuesOrCb?: any[] | ((err: Error | null, result?: PgLikeResult) => void),
  cb?: (err: Error | null, result?: PgLikeResult) => void,
): {
  text: string;
  values?: any[];
  callback?: (err: Error | null, result?: PgLikeResult) => void;
} {
  let callback = cb;
  let values: any[] | undefined;

  if (typeof valuesOrCb === "function") {
    callback = valuesOrCb;
  } else if (Array.isArray(valuesOrCb)) {
    values = valuesOrCb;
  }

  if (typeof textOrConfig === "string") {
    return {
      text: textOrConfig,
      values,
      callback,
    };
  }

  const cfg = textOrConfig as QueryConfig & { query?: string };
  const text =
    typeof cfg.text === "string"
      ? cfg.text
      : typeof cfg.query === "string"
        ? cfg.query
        : undefined;
  if (!text) {
    throw new Error("pglite: query config missing text");
  }
  const cfgValues = Array.isArray(cfg.values) ? cfg.values : undefined;
  return {
    text,
    values: cfgValues ?? values,
    callback,
  };
}

function toPgResult(result: PgliteQueryResult): PgLikeResult {
  const rowCount =
    typeof result.affectedRows === "number"
      ? result.affectedRows
      : result.rows.length;
  return {
    rows: result.rows,
    fields: result.fields,
    rowCount,
  };
}

class PglitePoolClient {
  private readonly sessionId = makeSessionId("client");

  constructor(private readonly pool: PglitePool) {}

  async query(...args: QueryArgs): Promise<PgLikeResult> {
    return await this.pool.queryForSession(this.sessionId, ...args);
  }

  release(): void {
    releaseAllLocks(this.sessionId);
  }

  async connect(): Promise<void> {
    // no-op
  }

  async end(): Promise<void> {
    // no-op for client-level end
  }
}

const listenRegex = /^\s*listen\s+(.+?)\s*;?\s*$/i;
const unlistenRegex = /^\s*unlisten\s+(.+?)\s*;?\s*$/i;

// Advisory locks in pglite are emulated in-process, keyed by the
// hashtext argument and scoped per "session" (pool client or
// pg client). We track ownership + re-entrancy counts and a FIFO
// waitlist to approximate pg_advisory_lock / pg_try_advisory_lock
// / pg_advisory_unlock behavior for tests.
const advisoryLocks = new Map<string, AdvisoryLock>();
const sessionLocks = new Map<string, Map<string, number>>();
let nextSessionId = 1;

function makeSessionId(prefix: string): string {
  const id = nextSessionId;
  nextSessionId += 1;
  return `${prefix}-${id}`;
}

function extractLockKey(text: string, values?: any[]): string | null {
  if (values && values.length > 0) {
    return String(values[0]);
  }
  const match = text.match(/hashtext\(\s*'([^']+)'\s*\)/i);
  return match ? match[1] : null;
}

function trackSessionLock(sessionId: string, key: string): void {
  let byKey = sessionLocks.get(sessionId);
  if (!byKey) {
    byKey = new Map<string, number>();
    sessionLocks.set(sessionId, byKey);
  }
  byKey.set(key, (byKey.get(key) ?? 0) + 1);
}

function untrackSessionLock(sessionId: string, key: string): void {
  const byKey = sessionLocks.get(sessionId);
  if (!byKey) return;
  const nextCount = (byKey.get(key) ?? 0) - 1;
  if (nextCount > 0) {
    byKey.set(key, nextCount);
    return;
  }
  byKey.delete(key);
  if (byKey.size === 0) {
    sessionLocks.delete(sessionId);
  }
}

function releaseAllLocks(sessionId: string): void {
  const byKey = sessionLocks.get(sessionId);
  if (!byKey) return;
  for (const key of byKey.keys()) {
    const entry = advisoryLocks.get(key);
    if (!entry || entry.owner !== sessionId) {
      continue;
    }
    const next = entry.waiters.shift();
    if (next) {
      entry.owner = next.sessionId;
      entry.count = 1;
      next.resolve();
    } else {
      advisoryLocks.delete(key);
    }
  }
  sessionLocks.delete(sessionId);
}

async function advisoryLock(sessionId: string, key: string): Promise<void> {
  const entry = advisoryLocks.get(key);
  if (!entry) {
    advisoryLocks.set(key, { owner: sessionId, count: 1, waiters: [] });
    trackSessionLock(sessionId, key);
    return;
  }
  if (entry.owner === sessionId) {
    entry.count += 1;
    trackSessionLock(sessionId, key);
    return;
  }
  await new Promise<void>((resolve) => {
    entry.waiters.push({
      sessionId,
      resolve: () => {
        trackSessionLock(sessionId, key);
        resolve();
      },
    });
  });
}

function tryAdvisoryLock(sessionId: string, key: string): boolean {
  const entry = advisoryLocks.get(key);
  if (!entry) {
    advisoryLocks.set(key, { owner: sessionId, count: 1, waiters: [] });
    trackSessionLock(sessionId, key);
    return true;
  }
  if (entry.owner === sessionId) {
    entry.count += 1;
    trackSessionLock(sessionId, key);
    return true;
  }
  return false;
}

function advisoryUnlock(sessionId: string, key: string): boolean {
  const entry = advisoryLocks.get(key);
  if (!entry || entry.owner !== sessionId) {
    return false;
  }
  untrackSessionLock(sessionId, key);
  entry.count -= 1;
  if (entry.count > 0) {
    return true;
  }
  const next = entry.waiters.shift();
  if (next) {
    entry.owner = next.sessionId;
    entry.count = 1;
    next.resolve();
    return true;
  }
  advisoryLocks.delete(key);
  return true;
}

async function handleAdvisoryQuery(
  sessionId: string,
  text: string,
  values?: any[],
): Promise<PgLikeResult | null> {
  const normalized = text.toLowerCase();
  if (normalized.includes("pg_try_advisory_lock")) {
    const key = extractLockKey(text, values);
    const locked = key ? tryAdvisoryLock(sessionId, key) : false;
    return { rows: [{ locked }], rowCount: 1 };
  }
  if (normalized.includes("pg_advisory_unlock")) {
    const key = extractLockKey(text, values);
    const unlocked = key ? advisoryUnlock(sessionId, key) : false;
    return { rows: [{ pg_advisory_unlock: unlocked }], rowCount: 1 };
  }
  if (normalized.includes("pg_advisory_lock")) {
    const key = extractLockKey(text, values);
    if (key) {
      await advisoryLock(sessionId, key);
    }
    return { rows: [], rowCount: 0 };
  }
  return null;
}

class PglitePgClient extends EventEmitter {
  private readonly pool = getPglitePool();
  private readonly sessionId = makeSessionId("pg");
  private readonly subscriptions = new Map<string, () => Promise<void>>();

  async query(
    textOrConfig: string | (QueryConfig & { query?: string }),
    valuesOrCb?: any[] | ((err: Error | null, result?: PgLikeResult) => void),
    cb?: (err: Error | null, result?: PgLikeResult) => void,
  ): Promise<PgLikeResult | void> {
    const { text, values, callback } = parseQueryConfig(
      textOrConfig,
      valuesOrCb,
      cb,
    );

    const promise = this.runQuery(text, values);
    if (callback) {
      promise.then(
        (result) => callback(null, result),
        (err) => callback(err as Error),
      );
      return;
    }
    return await promise;
  }

  end(): void {
    void this.cleanupListeners();
    releaseAllLocks(this.sessionId);
  }

  release(): void {
    this.removeAllListeners();
    void this.cleanupListeners();
    releaseAllLocks(this.sessionId);
  }

  private async runQuery(
    text: string,
    values?: any[],
  ): Promise<PgLikeResult> {
    const advisory = await handleAdvisoryQuery(this.sessionId, text, values);
    if (advisory) {
      return advisory;
    }
    const trimmed = text.trim();
    const listenMatch = trimmed.match(listenRegex);
    if (listenMatch) {
      const channel = this.normalizeChannel(listenMatch[1]);
      if (channel) {
        await this.ensureListen(channel);
      }
      return { rows: [], rowCount: 0 };
    }

    const unlistenMatch = trimmed.match(unlistenRegex);
    if (unlistenMatch) {
      const channel = this.normalizeChannel(unlistenMatch[1]);
      if (channel === "*") {
        await this.cleanupListeners();
      } else if (channel) {
        await this.removeListen(channel);
      }
      return { rows: [], rowCount: 0 };
    }

    if (values == null) {
      return await this.pool.query(text);
    }
    const normalized = normalizeValues(values) ?? values;
    return await this.pool.query(text, normalized);
  }

  private normalizeChannel(value: string): string | null {
    const trimmed = value.trim().replace(/;$/, "");
    if (!trimmed) {
      return null;
    }
    if (trimmed === "*") {
      return "*";
    }
    return trimmed.replace(/^"|"$/g, "");
  }

  private async ensureListen(channel: string): Promise<void> {
    if (this.subscriptions.has(channel)) {
      return;
    }
    const pg = await getPglite();
    const unsubscribe = await pg.listen(channel, (payload) => {
      this.emit("notification", { channel, payload });
    });
    this.subscriptions.set(channel, unsubscribe);
  }

  private async removeListen(channel: string): Promise<void> {
    const unsubscribe = this.subscriptions.get(channel);
    if (!unsubscribe) {
      return;
    }
    await unsubscribe();
    this.subscriptions.delete(channel);
  }

  private async cleanupListeners(): Promise<void> {
    const entries = Array.from(this.subscriptions.entries());
    this.subscriptions.clear();
    await Promise.allSettled(entries.map(([, unsubscribe]) => unsubscribe()));
  }
}

export class PglitePool {
  public readonly options = { database: "pglite" };
  private queue: Promise<unknown> = Promise.resolve();

  async query(...args: QueryArgs): Promise<PgLikeResult> {
    return await this.queryForSession("pool", ...args);
  }

  async queryForSession(
    sessionId: string,
    ...args: QueryArgs
  ): Promise<PgLikeResult> {
    const { text, values } = normalizeQueryArgs(args);
    return await withLowlevelDebug(`pool:${sessionId}`, text, values, async () => {
      const advisory = await handleAdvisoryQuery(sessionId, text, values);
      if (advisory) {
        return advisory;
      }
      return await this.enqueue(async () => {
        const pg = await getPglite();
        const result =
          values == null ? await pg.query(text) : await pg.query(text, values);
        return toPgResult(result as PgliteQueryResult);
      });
    });
  }

  async connect(): Promise<PglitePoolClient> {
    return new PglitePoolClient(this);
  }

  async end(): Promise<void> {
    L.debug("closing PGlite");
    await closePglite();
  }

  getOptions(): { database: string } {
    return this.options;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

let pool: PglitePool | undefined;

export function getPglitePool(): PglitePool {
  if (!pool) {
    pool = new PglitePool();
  }
  return pool;
}

export function getPgliteClient(): PglitePoolClient {
  return new PglitePoolClient(getPglitePool());
}

export function getPglitePgClient(): PglitePgClient {
  return new PglitePgClient();
}
