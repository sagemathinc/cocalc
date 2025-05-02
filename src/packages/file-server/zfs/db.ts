/*
Database
*/

import Database from "better-sqlite3";
import { context } from "./config";
import {
  primaryKey,
  type PrimaryKey,
  type Filesystem,
  type RawFilesystem,
  type SetFilesystem,
  OWNER_ID_FIELDS,
} from "./types";
import { is_array, is_date } from "@cocalc/util/misc";

let db: { [file: string]: Database.Database } = {};

const tableName = "filesystems";
const schema = {
  // this uniquely defines the filesystem (it's the compound primary key)
  owner_type: "TEXT",
  owner_id: "TEXT",
  namespace: "TEXT",
  name: "TEXT",

  // data about the filesystem
  pool: "TEXT",
  archived: "INTEGER",
  affinity: "TEXT",
  nfs: "TEXT",
  snapshots: "TEXT",
  last_edited: "TEXT",
  last_send_snapshot: "TEXT",
  last_bup_backup: "TEXT",
  error: "TEXT",
  last_error: "TEXT",
  used_by_dataset: "INTEGER",
  used_by_snapshots: "INTEGER",
  quota: "INTEGER",
};

const WHERE_PRIMARY_KEY =
  "WHERE namespace=? AND owner_type=? AND owner_id=? AND name=?";
function primaryKeyArgs(fs: PrimaryKey) {
  const { namespace, owner_type, owner_id, name } = primaryKey(fs);
  return [namespace, owner_type, owner_id, name];
}

export function getDb(databaseFile?): Database.Database {
  const file = databaseFile ?? context.SQLITE3_DATABASE_FILE;
  if (db[file] == null) {
    db[file] = new Database(file);
    initDb(db[file]);
  }
  return db[file]!;
}

function initDb(db) {
  const columnDefinitions = Object.entries(schema)
    .map(([name, type]) => `${name} ${type}`)
    .join(", ");

  // Create table if it doesn't exist
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
      ${columnDefinitions},
      PRIMARY KEY (namespace, owner_type, owner_id, name)
    )`,
  ).run();

  // Check for missing columns and add them
  const existingColumnsStmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const existingColumns = existingColumnsStmt.all().map((row) => row.name);

  for (const [name, type] of Object.entries(schema)) {
    if (!existingColumns.includes(name)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`).run();
    }
  }
}

// This is extremely dangerous and mainly used for unit testing:
export function resetDb() {
  const db = new Database(context.SQLITE3_DATABASE_FILE);
  db.prepare("DROP TABLE IF EXISTS filesystems").run();
  initDb(db);
}

function convertToSqliteType({ value, getFilesystem }) {
  if (is_array(value)) {
    return value.join(",");
  } else if (is_date(value)) {
    return value.toISOString();
  } else if (typeof value == "boolean") {
    return value ? 1 : 0;
  } else if (typeof value == "function") {
    const x = value(getFilesystem());
    if (typeof x == "function") {
      throw Error("function must not return a function");
    }
    // returned value needs to be converted
    return convertToSqliteType({ value: x, getFilesystem });
  }
  return value;
}

export function set(obj: SetFilesystem) {
  const pk = primaryKey(obj);
  const fields: string[] = [];
  const values: any[] = [];
  let filesystem: null | Filesystem = null;
  const getFilesystem = () => {
    if (filesystem == null) {
      filesystem = get(pk);
    }
    return filesystem;
  };
  for (const field in obj) {
    if (pk[field] !== undefined || OWNER_ID_FIELDS.includes(field)) {
      continue;
    }
    fields.push(field);
    values.push(convertToSqliteType({ value: obj[field], getFilesystem }));
  }
  let query = `UPDATE filesystems SET
    ${fields.map((field) => `${field}=?`).join(", ")}
    ${WHERE_PRIMARY_KEY}
  `;
  for (const x of primaryKeyArgs(pk)) {
    values.push(x);
  }
  const db = getDb();
  db.prepare(query).run(...values);
}

// Call this if something that should never happen, does in fact, happen.
// It will set the error state of the filesystem and throw the exception.
// Admins will be regularly notified of all filesystems in an error state.
export function fatalError(
  obj: PrimaryKey & {
    err: Error;
    desc?: string;
  },
) {
  set({
    ...primaryKey(obj),
    error: `${obj.err}${obj.desc ? " - " + obj.desc : ""}`,
    last_error: new Date(),
  });
  throw obj.err;
}

export function clearError(fs: PrimaryKey) {
  set({ ...fs, error: null });
}

export function clearAllErrors() {
  const db = getDb();
  db.prepare("UPDATE filesystems SET error=null").run();
}

export function getErrors() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM filesystems WHERE error!=''")
    .all() as RawFilesystem[];
}

export function touch(fs: PrimaryKey) {
  set({ ...fs, last_edited: new Date() });
}

export function filesystemExists(
  fs: PrimaryKey,
  databaseFile?: string,
): boolean {
  const db = getDb(databaseFile);
  const x = db
    .prepare("SELECT COUNT(*) AS count FROM filesystems " + WHERE_PRIMARY_KEY)
    .get(...primaryKeyArgs(fs));
  return (x as any).count > 0;
}

export function get(fs: PrimaryKey, databaseFile?: string): Filesystem {
  const db = getDb(databaseFile);
  const filesystem = db
    .prepare("SELECT * FROM filesystems " + WHERE_PRIMARY_KEY)
    .get(...primaryKeyArgs(fs)) as any;
  if (filesystem == null) {
    throw Error(`no filesystem ${JSON.stringify(fs)}`);
  }
  for (const key of ["nfs", "snapshots"]) {
    filesystem[key] = sqliteStringToArray(filesystem[key]);
  }
  filesystem["archived"] = !!filesystem["archived"];
  if (filesystem.last_edited) {
    filesystem.last_edited = new Date(filesystem.last_edited);
  }
  if (filesystem.last_error) {
    filesystem.last_error = new Date(filesystem.last_error);
  }
  return filesystem as Filesystem;
}

export function create(
  obj: PrimaryKey & {
    pool: string;
    affinity?: string;
  },
) {
  getDb()
    .prepare(
      "INSERT INTO filesystems(namespace, owner_type, owner_id, name, pool, affinity, last_edited) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      ...primaryKeyArgs(obj),
      obj.pool,
      obj.affinity,
      new Date().toISOString(),
    );
}

export function deleteFromDb(fs: PrimaryKey) {
  getDb()
    .prepare("DELETE FROM filesystems " + WHERE_PRIMARY_KEY)
    .run(...primaryKeyArgs(fs));
}

export function getAll({
  namespace = context.namespace,
}: { namespace?: string } = {}): RawFilesystem[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM filesystems WHERE namespace=?")
    .all(namespace) as RawFilesystem[];
}

export function getNamespacesAndPools(): { namespace: string; pool: string }[] {
  const db = getDb();
  return db
    .prepare("SELECT DISTINCT namespace, pool FROM filesystems")
    .all() as any;
}

export function getRecent({
  namespace,
  cutoff,
  databaseFile,
}: {
  namespace?: string;
  cutoff?: Date;
  databaseFile?: string;
} = {}): RawFilesystem[] {
  const db = getDb(databaseFile);
  if (cutoff == null) {
    cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  }
  const query = "SELECT * FROM filesystems WHERE last_edited>=?";
  if (namespace == null) {
    return db.prepare(query).all(cutoff.toISOString()) as RawFilesystem[];
  } else {
    return db
      .prepare(`${query} AND namespace=?`)
      .all(cutoff.toISOString(), namespace) as RawFilesystem[];
  }
}

function sqliteStringToArray(s?: string): string[] {
  if (!s) {
    return [];
  }
  return s.split(",");
}
