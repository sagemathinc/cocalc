import { SyncDoc, SyncOpts0, SyncOpts } from "../generic/sync-doc";
import { StringDocument } from "./doc";

export class SyncString extends SyncDoc {
  constructor(opts: SyncOpts0) {
    // TS question -- What is the right way to do this?
    (opts as SyncOpts).from_str = (str) => new StringDocument(str);
    (opts as SyncOpts).doctype = { type: "string" };
    super(opts as SyncOpts);
  }
}
