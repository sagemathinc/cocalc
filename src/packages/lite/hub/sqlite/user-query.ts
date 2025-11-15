import { EventEmitter } from "events";
import { cloneDeep, isEqual } from "lodash";
import { account_id } from "@cocalc/backend/data";
import { project_id } from "@cocalc/project/data";
import * as misc from "@cocalc/util/misc";
import { client_db, SCHEMA } from "@cocalc/util/schema";

import {
  clearTable,
  closeDatabase,
  deleteRow,
  getDatabase,
  getRow,
  initDatabase,
  listRows,
  upsertRow,
  type DatabaseOptions,
} from "./database";

interface Option {
  set?: boolean;
  delete?: boolean;
}

interface QueryOpts {
  query: Record<string, any>;
  options?: Option[];
  account_id?: string;
  project_id?: string;
  changes?: string;
  cb?: Function;
}

interface InitOptions extends DatabaseOptions {
  seed?: boolean;
}

const emitter = new EventEmitter();

export function close(): void {
  closeDatabase();
}

export function resetTable(table: string): void {
  clearTable(table);
}

export function init(options: InitOptions = {}): void {
  initDatabase(options);
  if (options.seed !== false) {
    seedDefaultData();
  }
}

function seedDefaultData(): void {
  ensureRow("accounts", {
    account_id,
    email_address: "user@cocalc.com",
  });
  ensureRow("projects", {
    project_id,
    title: "CoCalc Lite",
    state: { state: "running" },
  });
}

function ensureRow(table: string, row: Record<string, any>): void {
  const key = buildPrimaryKey(table, row);
  if (key == null) return;
  const existing = getRow(table, key);
  if (existing != null) {
    return;
  }
  upsertRow(table, key, row);
}

export default function userQuery(opts: QueryOpts): any {
  const { changes, cb } = opts;
  if (changes && cb == null) {
    throw Error("if changes is set then cb must also be set");
  }

  const subs = {
    "{account_id}": opts.account_id ?? account_id,
    "{project_id}": opts.project_id ?? project_id,
    "{now}": new Date(),
  };
  const query = cloneDeep(opts.query);
  misc.obj_key_subs(query, subs);

  if (misc.is_array(query)) {
    if (changes) {
      throw Error("changefeeds only implemented for single table queries");
    }
    const results = [] as any[];
    for (const q of query) {
      results.push(userQuery({ ...opts, query: q, changes: undefined, cb: undefined }));
    }
    return results;
  }

  let options = opts.options ?? [];
  let isSetQuery: boolean | undefined;
  if (!misc.is_array(options)) {
    throw Error("options must be an array");
  }
  for (const x of options) {
    if (x.set != null) {
      isSetQuery = !!x.set;
      options = options.filter((y) => y !== x);
      break;
    }
  }
  isSetQuery ??=
    misc.is_array(query) || !misc.has_null_leaf(query);

  return isSetQuery
    ? userSetQuery(query, options)
    : userGetQuery(query, options, changes, cb);
}

function resolveTableName(query: Record<string, any>): string {
  const table = Object.keys(query)[0];
  if (!table) {
    throw Error("invalid query");
  }
  const schema = SCHEMA[table];
  const virtual = schema?.virtual;
  if (typeof virtual === "string") {
    return virtual;
  }
  return table;
}

function getPrimaryKeys(table: string): string[] {
  return client_db.primary_keys(table) ?? [];
}

function normalizeValue(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, normalizeValue(v)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }
  return value;
}

function buildPrimaryKey(table: string, obj: Record<string, any>): string | undefined {
  const keys = getPrimaryKeys(table);
  if (keys.length === 0) return undefined;
  const pk: Record<string, any> = {};
  for (const field of keys) {
    const value = obj[field];
    if (value == null) {
      return undefined;
    }
    pk[field] = normalizeValue(value);
  }
  return JSON.stringify(pk);
}

function matchesRow(row: Record<string, any>, filter: Record<string, any>): boolean {
  for (const key of Object.keys(filter)) {
    const value = filter[key];
    if (value == null) continue;
    if (!isEqual(row[key], value)) {
      return false;
    }
  }
  return true;
}

function filterRows(rows: Record<string, any>[], filter: Record<string, any>): any[] {
  const matches = rows.filter((row) => matchesRow(row, filter));
  return matches.map((row) => cloneDeep(row));
}

function userGetQuery(
  query: any,
  _options: Option[],
  changes?: string,
  cb?: Function,
): Record<string, any> {
  const table = Object.keys(query)[0];
  const dbTable = resolveTableName(query);
  const payload = query[table];
  const multi = misc.is_array(payload);
  const filter = multi ? payload[0] : payload;
  const pk = buildPrimaryKey(dbTable, filter);
  let rows: any[];
  if (pk != null) {
    const existing = getRow(dbTable, pk);
    rows = existing ? [existing] : [];
  } else {
    rows = listRows(dbTable);
  }
  const matches = filterRows(rows, filter ?? {});
  const fields = Object.keys(filter ?? {});
  const projected = matches.map((row) => pickFields(row, fields, dbTable));
  setDefaults(dbTable, projected, fields);

  if (changes) {
    if (!multi) {
      throw Error("changefeeds only implemented for array queries");
    }
    if (!cb) {
      throw Error("callback required for changefeed");
    }
    serveChangefeed({ table: dbTable, id: changes, callback: cb });
  }

  return { [table]: multi ? projected : projected[0] };
}

function pickFields(
  row: Record<string, any>,
  fields: string[],
  table: string,
): Record<string, any> {
  if (!row) return row;
  const keys = new Set<string>(fields);
  for (const key of getPrimaryKeys(table)) {
    keys.add(key);
  }
  if (keys.size === 0) {
    return cloneDeep(row);
  }
  const projected: Record<string, any> = {};
  for (const field of keys) {
    projected[field] = cloneDeep(row[field]);
  }
  return projected;
}

function mergeRow(
  existing: Record<string, any> | undefined,
  updates: Record<string, any>,
): Record<string, any> {
  if (!existing) {
    return cloneDeep(updates);
  }
  const merged: Record<string, any> = { ...existing };
  for (const key of Object.keys(updates)) {
    const value = updates[key];
    if (misc.is_object(value) && misc.is_object(merged[key])) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function userSetQuery(query: any, options: Option[]): any {
  if (misc.is_array(query)) {
    const result: any[] = [];
    for (const q of query) {
      result.push(userSetQuery(q, options));
    }
    return result;
  }
  const table = Object.keys(query)[0];
  const dbTable = resolveTableName(query);
  const payload = query[table];
  const pk = buildPrimaryKey(dbTable, payload);
  if (pk == null) {
    throw Error(`set query requires primary key fields for '${table}'`);
  }
  const isDelete = options.some((x) => x.delete);
  const existing = getRow(dbTable, pk);
  if (isDelete) {
    if (existing != null) {
      deleteRow(dbTable, pk);
      emitter.emit(dbTable, { ...existing, __deleted: true });
    }
    return { [table]: existing ?? {} };
  }
  const merged = mergeRow(existing, payload);
  upsertRow(dbTable, pk, merged);
  emitter.emit(dbTable, merged);
  return { [table]: merged };
}

function setDefaults(table: string, rows: any[], fields: string[]): void {
  if (rows.length === 0 || fields.length === 0) return;
  const clientQuery = SCHEMA[table]?.user_query;
  if (!clientQuery) return;
  const defaults = clientQuery.get?.fields ?? {};
  for (const field of fields) {
    const defaultValue = defaults[field];
    if (defaultValue == null) continue;
    for (const row of rows) {
      if (row == null) continue;
      const current = row[field];
      if (current == null) {
        row[field] = cloneDeep(defaultValue);
      } else if (
        typeof defaultValue === "object" &&
        typeof current === "object" &&
        !Array.isArray(defaultValue)
      ) {
        for (const key of Object.keys(defaultValue)) {
          if (current[key] == null) {
            current[key] = defaultValue[key];
          }
        }
      }
    }
  }
}

const listeners: Record<string, { table: string; listener: (...args: any[]) => void }> = {};

function serveChangefeed({
  table,
  id,
  callback,
}: {
  table: string;
  id: string;
  callback: Function;
}): void {
  const listener = (row: any) => callback(undefined, row);
  listeners[id] = { table, listener };
  emitter.on(table, listener);
}

export function cancelQuery(id: string): void {
  const entry = listeners[id];
  if (!entry) return;
  emitter.removeListener(entry.table, entry.listener);
  delete listeners[id];
}

export function getDatabaseHandle() {
  return getDatabase();
}
