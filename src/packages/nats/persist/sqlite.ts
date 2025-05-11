import type BetterSqlite3 from "better-sqlite3";
type Database = BetterSqlite3.Database;
export { type Database };

let betterSqlite3: any = null;

export let compress: (
  data: Buffer | string | ArrayBuffer | Uint8Array,
  _dict?: string | Buffer,
) => Buffer = () => {
  throw Error("must initialize persiste.sqlite");
};

export let decompress: (
  data: Buffer | string | ArrayBuffer | Uint8Array,
  _dict?: string | Buffer,
) => Buffer = () => {
  throw Error("must initialize persiste.sqlite");
};

export function setDatabase({
  betterSqlite3: _betterSqlite3,
  lz4,
}: {
  betterSqlite3;
  lz4;
}) {
  betterSqlite3 = _betterSqlite3;
  compress = lz4.compressSync;
  decompress = lz4.uncompressSync;
}

export function createDatabase(...args): Database {
  if (betterSqlite3 == null) {
    throw Error(
      "nats/persist must be initialized with the better-sqlite3 module -- import from backend/nats/persist instead",
    );
  }
  return new betterSqlite3(...args);
}
