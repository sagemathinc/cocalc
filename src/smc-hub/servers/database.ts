import { db } from "../postgres";

// IMPORTANT: For typescript we make the default export have type PostgreSQL.
// In reality the default could be undefined until init gets called.
// We thus assume for convenience that init gets called before this default
// object gets used.
export let database: any = undefined;

export default function init(opts) {
  if (database != null) {
    throw Error("only call database init once");
  }
  database = db(opts);
}
