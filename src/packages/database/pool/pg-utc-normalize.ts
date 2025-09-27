// see https://chatgpt.com/share/68c2df30-1f30-800e-94de-38fbbcdc88bd
// Basically this ensures input Date objects are formated as iso strings,
// so they are interpreted as UTC time properly. The root cause is that
// our database schema uses "timestamp without timezone" everywhere, and
// it would be painful to migrate everything.   ANY query using
// pool.query('...', params)
// that potentially has Date's in params should pass the params through normalizeParams.
// This is taken care of automatically in getPool and the db class.

import type { Pool, QueryConfig } from "pg";

function normalizeValue(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalizeValue);
  return v;
}

export function normalizeValues(values?: any[]): any[] | undefined {
  return Array.isArray(values) ? values.map(normalizeValue) : values;
}

function normalizeQueryArgs(args: any[]): any[] {
  // Forms:
  // 1) query(text)
  // 2) query(text, values)
  // 3) query(text, values, callback)
  // 4) query(config)
  // 5) query(config, callback)
  if (typeof args[0] === "string") {
    if (Array.isArray(args[1])) {
      const v = normalizeValues(args[1]);
      if (args.length === 2) return [args[0], v];
      // callback in position 2
      return [args[0], v, args[2]];
    }
    // only text (or text, callback)
    return args;
  } else {
    // config object path
    const cfg: QueryConfig = { ...args[0] };
    if ("values" in cfg && Array.isArray(cfg.values)) {
      cfg.values = normalizeValues(cfg.values)!;
    }
    if (args.length === 1) return [cfg];
    return [cfg, args[1]]; // callback passthrough
  }
}

export function patchPoolForUtc(pool: Pool): Pool {
  if ((pool as any).__utcNormalized) return pool;

  // Patch pool.query
  const origPoolQuery = pool.query.bind(pool);
  (pool as any).query = function (...args: any[]) {
    return origPoolQuery(...normalizeQueryArgs(args));
  } as typeof pool.query;

  pool.on("connect", (client) => {
    if ((client as any).__utcNormalized) return;
    const origQuery = client.query.bind(client);
    client.query = function (...args: any[]) {
      return origQuery(...normalizeQueryArgs(args));
    } as typeof client.query;
    (client as any).__utcNormalized = true;
  });

  (pool as any).__utcNormalized = true;
  return pool;
}
