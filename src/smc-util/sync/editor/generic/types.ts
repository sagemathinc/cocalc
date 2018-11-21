/* A Patch is an entry in the patches table, as represented
   in memory locally here.
*/

export interface Patch {
  time: Date; // timestamp of when patch made
  patch: CompressedPatch /* compressed format patch (stored as a
                   JSON *string* in database, but array/object here) */;
  user_id: number /* 0-based integer "id" of user
                     syncstring table has id-->account_id map) */;
  snapshot?: string; // to_str() applied to the document at this point in time
  sent?: Date; // when patch actually sent, which may be later than when made
  prev?: Date; // timestamp of previous patch sent from this session
}

export interface Document {
  apply_patch(CompressedPatch): Document;
  make_patch(Document): CompressedPatch;
  is_equal(Document): boolean;
  to_str(): string;
}

export type CompressedPatch = any[];
