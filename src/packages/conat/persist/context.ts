/*
Define functions for using sqlite, the filesystem, compression, etc.
These are functions that typically get set via nodejs on the backend,
not from a browser.    Making this explicit helps clarify the dependence
on the backend and make the code more unit testable.
*/

import type BetterSqlite3 from "better-sqlite3";
type Database = BetterSqlite3.Database;
export { type Database };

let betterSqlite3: any = null;

export let compress: (data: Buffer) => Buffer = () => {
  throw Error("must initialize persist.sqlite");
};

export let decompress: (data: Buffer) => Buffer = () => {
  throw Error("must initialize persist.sqlite");
};

export let syncFiles = { local: "", archive: "" };

export let ensureContainingDirectoryExists: (path: string) => Promise<void> = (
  _path,
) => {
  throw Error("must initialize persiste.sqlite");
};

export function initContext(opts: {
  betterSqlite3;
  compress: (Buffer) => Buffer;
  decompress: (Buffer) => Buffer;
  syncFiles: { local: string; archive: string };
  ensureContainingDirectoryExists: (path: string) => Promise<void>;
}) {
  betterSqlite3 = opts.betterSqlite3;
  compress = opts.compress;
  decompress = opts.decompress;
  syncFiles = opts.syncFiles;
  ensureContainingDirectoryExists = opts.ensureContainingDirectoryExists;
}

export function createDatabase(...args): Database {
  if (betterSqlite3 == null) {
    throw Error(
      "conat/persist must be initialized with the better-sqlite3 module -- import from backend/nats/persist instead",
    );
  }
  return new betterSqlite3(...args);
}
