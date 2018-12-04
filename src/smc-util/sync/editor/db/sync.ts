import { SyncDoc, SyncOpts0, SyncOpts } from "../generic/sync-doc";
import { DBDocument } from "./doc";

export interface SyncDBOpts extends SyncOpts0 {
  primary_keys : string[];
  string_cols? : string[];
}

export class SyncDB extends SyncDoc {
  constructor(opts: SyncDBOpts) {
    // TS question -- What is the right way to do this?
    (opts as SyncOpts).from_str = str => new DBDocument(str, opts.primary_keys, opts.string_cols);
    (opts as SyncOpts).doctype = {
      type: "db",
      patch_format: 1,
      opts: {
        primary_keys: opts.primary_keys,
        string_cols: opts.string_cols
      }
    };
    super(opts as SyncOpts);
  }
}
