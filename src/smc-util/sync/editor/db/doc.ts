import { CompressedPatch, Document } from "../generic/types";
import * as immutable from "immutable";

//import { } from "./util";

type Record = immutable.Map<string, any>;
type Records = immutable.List<Record>;
type Index = immutable.Map<string, immutable.Set>;
type Indexes = immutable.Map<string, Index>;

interface Changes {
  changes: immutable.Set<string>; // primary keys that changed
  from_db: Document; // DBDocument object where change tracking started.
}

// Immutable DB document
export class DBDocument implements Document {
  private primary_keys: Set;

  // Columns that should be treated as non-atomic strings.
  // This means simultaneous changes by multiple clients are
  // merged, instead of last-write-wins.  Also, large changes
  // are propagated at patches, rather than sending
  // complete string.
  private string_cols: string[];

  // list of records -- each is assumed to be an immutable.Map.
  private records: immutable.List<Record>;

  // TODO: describe
  private everything: immutable.Set;
  // TODO: describe
  private indexes: Indexes;

  // Change tracking -- not used internally, but can be useful by client code.
  private changes: Changes;

  public readonly size: number;

  constructor(
    primary_keys: Set<string>,
    string_cols: Set<string>,
    records?: Records = immutable.List(),
    everything?: immutable.Set<number>,
    indexes?: Indexes,
    changes?
  ) {
    this.primary_keys = new Set(primary_keys);
    this.string_cols = new Set(string_cols);
    this.records = records;
    this.everything = everything == null ? this.init_everything() : everything;
    this.size = this.everything.size;
    this.indexes = indexes == null ? this.init_indexes() : indexes;
    this.changes = changes == null ? this.init_changes() : changes;
  }

  // sorted immutable Set of i such that this.records.get(i) is defined.
  private init_everything(): immutable.Set<number> {
    const v: number[] = [];
    for (let n = 0; n < this.records.size; n++) {
      if (this.records.get(n) != undefined) {
        v.push(n);
      }
    }
    return immutable.Set(v).sort();
  }

  private init_indexes(): Indexes {
    // Build indexes
    let indexes: Indexes = immutable.Map();
    for (let field of this.primary_keys) {
      const index: Index = immutable.Map();
      indexes = indexes.set(field, index);
    }
    this.records.map((record: Record, n: number) => {
      indexes.map((index: Index, field: string) => {
        const val = record.get(field);
        if (val != null) {
          const k: string = to_key(val);
          let matches = index.get(k);
          if (matches != null) {
            matches = matches.add(n).sort();
          } else {
            matches = immutable.Set([n]);
          }
          indexes = indexes.set(field, index.set(k, matches));
        }
      });
    });
    return indexes;
  }

  private init_changes(): Changes {
    return { changes: immutable.Set(), from_db: this };
  }

  public to_str(): string {
    // TODO
  }

  public is_equal(other?: DBDocument): boolean {
    // TODO
  }

  public apply_patch(patch: CompressedPatch): DBDocument {
    // TODO
  }

  public make_patch(other: DBDocument): CompressedPatch {
    // TODO
  }
}
