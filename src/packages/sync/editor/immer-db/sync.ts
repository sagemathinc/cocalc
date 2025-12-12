/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { SyncDoc, SyncOpts0, SyncOpts } from "../generic/sync-doc";
import { from_str, ImmerDBDocument } from "./doc";
import { Document, DocType } from "../generic/types";

export interface ImmerDBOpts0 extends SyncOpts0 {
  primary_keys: string[];
  string_cols?: string[];
  // format = what format to store the underlying file using: json or msgpack
  // The default is json unless otherwise specified.
  format?: "json" | "msgpack";
}

export interface ImmerDBOpts extends ImmerDBOpts0 {
  from_str: (str: string) => Document;
  doctype: DocType;
}

export class ImmerDB extends SyncDoc {
  constructor(opts: ImmerDBOpts0) {
    const opts1: ImmerDBOpts = opts as unknown as ImmerDBOpts;
    if (opts1.primary_keys == null || opts1.primary_keys.length <= 0) {
      throw Error("primary_keys must have length at least 1");
    }
    opts1.from_str = (str) =>
      from_str(str, opts1.primary_keys, opts1.string_cols ?? []);
    opts1.doctype = {
      type: "db",
      patch_format: 1,
      opts: {
        primary_keys: opts1.primary_keys,
        string_cols: opts1.string_cols ?? [],
      },
    };
    super(opts1 as SyncOpts);
  }

  get_one(arg?): any {
    // I know it is really of type ImmerDBDocument.
    return (this.get_doc() as ImmerDBDocument).get_one(arg);
  }
}
