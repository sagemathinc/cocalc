/*
 *  This file is part of CoCalc: Copyright (c) 2026 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

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

type QueryArgs =
  | [string]
  | [string, any[]]
  | [QueryConfig]
  | [QueryConfig, any];

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
  constructor(private readonly pool: PglitePool) {}

  async query(...args: QueryArgs): Promise<PgLikeResult> {
    return await this.pool.query(...args);
  }

  release(): void {
    // no-op
  }

  async connect(): Promise<void> {
    // no-op
  }

  async end(): Promise<void> {
    // no-op for client-level end
  }
}

export class PglitePool {
  public readonly options = { database: "pglite" };
  private queue: Promise<unknown> = Promise.resolve();

  async query(...args: QueryArgs): Promise<PgLikeResult> {
    const { text, values } = normalizeQueryArgs(args);
    return await this.enqueue(async () => {
      const pg = await getPglite();
      const result =
        values == null ? await pg.query(text) : await pg.query(text, values);
      return toPgResult(result as PgliteQueryResult);
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
