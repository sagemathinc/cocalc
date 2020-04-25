import { SyncDoc, SyncOpts0, SyncOpts } from "../generic/sync-doc";
import { from_str, DBDocument } from "./doc";
import { Document, DocType } from "../generic/types";

export interface SyncDBOpts0 extends SyncOpts0 {
  primary_keys: string[];
  string_cols: string[];
}

export interface SyncDBOpts extends SyncDBOpts0 {
  from_str: (str: string) => Document;
  doctype: DocType;
}

export class SyncDB extends SyncDoc {
  constructor(opts: SyncDBOpts0) {
    // Typescript question -- What is the right way to do this?
    const opts1: SyncDBOpts = (opts as unknown) as SyncDBOpts;
    if (opts1.primary_keys == null || opts1.primary_keys.length <= 0) {
      throw Error("primary_keys must have length at least 1");
    }
    opts1.from_str = (str) =>
      from_str(str, opts1.primary_keys, opts1.string_cols);
    opts1.doctype = {
      type: "db",
      patch_format: 1,
      opts: {
        primary_keys: opts1.primary_keys,
        string_cols: opts1.string_cols,
      },
    };
    super(opts1 as SyncOpts);
  }

  get_one(arg?) {
    // I know it is really of type DBDocument.
    return (this.get_doc() as DBDocument).get_one(arg);
  }
}
