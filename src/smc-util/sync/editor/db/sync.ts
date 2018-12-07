import { SyncDoc, SyncOpts0, SyncOpts } from "../generic/sync-doc";
import { from_str } from "./doc";
import { Document, DocType } from "../generic/types";

export interface SyncDBOpts extends SyncOpts0 {
  from_str: (string) => Document;
  doctype: DocType;
  primary_keys : string[];
  string_cols  : string[];
}

export class SyncDB extends SyncDoc {
  constructor(opts: SyncDBOpts) {
    // TS question -- What is the right way to do this?
    opts.from_str = str => from_str(str, opts.primary_keys, opts.string_cols);
    opts.doctype = {
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
