import { CompressedPatch, Document } from "../generic/types";
import * as immutable from "immutable";
import { isEqual } from "underscore";

import { is_array, is_object, copy_without } from "../../../misc";

import { make_patch as string_make_patch } from "../generic/util";
import { map_merge_patch, merge_set, nonnull_cols, to_str } from "./util";

type Record = immutable.Map<string, any>;
type Records = immutable.List<Record>;
type Index = immutable.Map<string, immutable.Set>;
type Indexes = immutable.Map<string, Index>;

export type WhereCondition = { [field: string]: any };
export type SetCondition = immutable.Map<string, any> | Map<string, any>;

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

  private to_str_cache?: string;

  constructor(
    primary_keys: Set<string>,
    string_cols: Set<string>,
    records?: Records = immutable.List(),
    everything?: immutable.Set<number>,
    indexes?: Indexes,
    changes?
  ) {
    this.primary_key_cols = this.primary_key_cols.bind(this);
    this.primary_key_part = this.primary_key_part.bind(this);

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
    if (this.to_str_cache != null) {
      // We can use a cache, since this is an immutable object
      return this.to_str_cache;
    }
    return (this.to_str_cache = to_str(this.to_obj()));
  }

  public is_equal(other?: DBDocument): boolean {
    if (other == null) {
      // Definitely not equal if not defined.
      return false;
    }
    if (this.records === other.records) {
      return true;
    }
    if (this.size !== other.size) {
      return false;
    }
    // We include undefineds in the sets below
    // since records is a List of Record or undefined, i.e.,
    // we use undefined as a sentinel in order to
    // make deletes be efficient.
    return immutable
      .Set(this.records)
      .add(undefined)
      .equals(immutable.Set(other.records).add(undefined));
  }

  public apply_patch(patch: CompressedPatch): DBDocument {
    let i = 0;
    let db = this;
    while (i < patch.length) {
      if (patch[i] === -1) {
        db = db.delete(patch[i + 1]);
      } else if (patch[i] === 1) {
        db = db.set(patch[i + 1]);
      }
      i += 2;
    }
    return db;
  }

  public make_patch(other: DBDocument): CompressedPatch {
    if (other.size === 0) {
      // Special case -- delete everything
      return [-1, [{}]];
    }

    let t0 = immutable.Set(this.records);
    let t1 = immutable.Set(other.records);
    // Remove the common intersection -- nothing going on there.
    // Doing this greatly reduces the complexity in the common
    // case in which little has changed
    const common = t0.intersect(t1).add(undefined);
    t0 = t0.subtract(common);
    t1 = t1.subtract(common);

    // Easy very common special cases
    if (t0.size === 0) {
      // Special case: t0 is empty -- insert all the records.
      return [1, t1.toJS()];
    }
    if (t1.size === 0) {
      // Special case: t1 is empty -- bunch of deletes
      const v: Map<string, any>[] = [];
      t0.map(x => {
        v.push(this.primary_key_part(x.toJS()));
      });
      return [-1, v];
    }

    // compute the key parts of t0 and t1 as sets
    // means -- set got from t0 by taking only the primary_key columns
    const k0 = t0.map(this.primary_key_cols);
    const k1 = t1.map(this.primary_key_cols);

    const add: any[] = [];
    let remove: any[] | undefined = undefined;

    // Deletes: everything in k0 that is not in k1
    const deletes = k0.subtract(k1);
    if (deletes.size > 0) {
      remove = deletes.toJS();
    }

    // Inserts: everything in k1 that is not in k0
    const inserts = k1.subtract(k0);
    if (inserts.size > 0) {
      inserts.map(k => {
        add.push(other.get_one(k.toJS()).toJS());
      });
    }

    // Everything in k1 that is also in k0 -- these
    // must have all changed
    const changed = k1.intersect(k0);
    if (changed.size > 0) {
      changed.map(k => {
        const obj = k.toJS();
        const obj0 = this.primary_key_part(obj);
        const from = this.get_one(obj0).toJS();
        const to = other.get_one(obj0).toJS();
        // undefined for each key of from not in to
        for (k in from) {
          if (to[k] == null) {
            obj[k] = null;
          }
        }
        // Explicitly set each key of to that is different
        // than corresponding key of from
        for (k in to) {
          const v = to[k];
          if (!isEqual(from[k], v)) {
            if (this.string_cols.has(k) && from[k] != null && v != null) {
              // A string patch
              obj[k] = string_make_patch(from[k], v);
            } else if (is_object(from[k]) && is_object(v)) {
              // Changing from one map to another, where they are not
              // equal -- can use a merge to make this more efficient.
              // This is an important optimization, to avoid making
              // patches HUGE.
              obj[k] = map_merge_patch(from[k], v);
            } else {
              obj[k] = v;
            }
          }
        }
        add.push(obj);
      });
    }

    const patch: any[] = [];
    if (remove != null) {
      patch.push(-1);
      patch.push(remove);
    }
    if (add.length > 0) {
      patch.push(1);
      patch.push(add);
    }

    return patch;
  }

  // Given an immutable map f, return its restriction
  // to the primary keys.
  private primary_key_cols(
    f: immutable.Map<string, any>
  ): immutable.Map<string, any> {
    return f.filter((v, k) => this.primary_keys.has(k));
  }

  private select(where: WhereCondition): immutable.Set | undefined {
    if (immutable.Map.isMap(where)) {
      // TODO: maybe do not allow?
      where = where.toJS();
    }
    // Return immutable set with defined indexes the elts of @_records that
    // satisfy the where condition.
    const len = misc.len(where);
    let result = undefined;
    for (let field in where) {
      const value = where[field];
      const index = this.indexes.get(field);
      if (index == null) {
        throw Error(`field '${field}' must be a primary key`);
      }
      const v: immutable.Set | undefined = index.get(to_key(value));
      // v may be undefined here
      if (v == null) {
        return immutable.Set(); // no matches for this field - done
      }
      if (len === 1) {
        // no need to do further intersection
        return v;
      }
      if (result != null) {
        // intersect with what we've found so far via indexes.
        result = result.intersect(v);
      } else {
        result = v;
      }
    }
    if (result == null) {
      // where condition must have been empty -- matches everything
      return this.everything;
    } else {
      return result;
    }
  }

  // Used internally for determining the set/where parts of an object.
  private parse(
    obj: Map<string, any>
  ): { where: Map<string, any>; set: Map<string, any> } {
    const where = {};
    const set = {};
    for (let field in obj) {
      const val = obj[field];
      if (this.primary_keys.has(field) != null) {
        if (val != null) {
          where[field] = val;
        }
      } else {
        set[field] = val;
      }
    }
    // return obj, in case had to convert from immutable
    return { where, set };
  }

  public set(obj: SetCondition | SetCondition[]): DBDocument {
    if (is_array(obj)) {
      let z = this;
      for (let x of obj) {
        z = z.set(x);
      }
      return z;
    }
    if (immutable.Map.isMap(obj)) {
      // TODO: maybe do not allow?
      // it is very clean/convenient to allow this
      obj = obj.toJS();
    }
    const { set, where } = this.parse(obj);
    const matches = this.select(where);
    let { changes } = this.changes;
    const n = matches != null ? matches.first() : undefined;
    if (n != null) {
      // edit the first existing record that matches
      let record = this.records.get(n);
      const before = record;
      for (let field in set) {
        const value = set[field];
        if (value === null) {
          // null = how to delete fields
          record = record.delete(field);
        } else {
          if (this.string_cols.has(field) && is_array(value)) {
            // special case: a string patch
            record = record.set(
              field,
              syncstring.apply_patch(value, before.get(field, ""))[0]
            );
          } else {
            let new_val;
            const cur = record.get(field);
            const change = immutable.fromJS(value);
            if (immutable.Map.isMap(cur) && immutable.Map.isMap(change)) {
              new_val = merge_set(cur, change);
            } else {
              new_val = change;
            }
            record = record.set(field, new_val);
          }
        }
      }

      if (!before.equals(record)) {
        // there was an actual change, so update; doesn't change
        // anything involving indexes.
        changes = changes.add(this.primary_key_cols(record));
        return new DBDocument(
          this.primary_keys,
          this.string_cols,
          this.records.set(n, record),
          this.everything,
          this.indexes,
          { changes, from_db: this.changes.from_db }
        );
      } else {
        return this;
      }
    } else {
      // The sparse array matches had nothing in it, so append a new record.
      for (field in this.string_cols) {
        if (obj[field] != null && misc.is_array(obj[field])) {
          // It's a patch -- but there is nothing to patch,
          // so discard this field
          obj = copy_without(obj, field);
        }
      }
      // remove null columns (null indicates delete)
      record = nonnull_cols(immutable.fromJS(obj));
      changes = changes.add(this.primary_key_cols(record));
      const records = this.records.push(record);
      n = records.size - 1;
      const everything = this.everything.add(n);
      // update indexes
      let indexes = this.indexes;
      for (field of this.primary_keys) {
        const val = obj[field];
        if (val != null) {
          let index = indexes.get(field);
          if (index == null) {
            index = immutable.Map();
          }
          const k = to_key(val);
          matches = index.get(k);
          if (matches != null) {
            matches = matches.add(n).sort();
          } else {
            matches = immutable.Set([n]);
          }
          indexes = indexes.set(field, index.set(k, matches));
        }
      }
      return new DBDocument(
        this.primary_keys,
        this.string_cols,
        records,
        everything,
        indexes,
        { changes, from_db: this.changes.from_db }
      );
    }
  }

  public delete(where: WhereCondition | WhereCondition[]): DBDocument {
    if (is_array(where)) {
      let z = this;
      for (let x of where) {
        z = z.delete(x);
      }
      return z;
    }
    // console.log("delete #{misc.to_json(where)}")
    // if where undefined, will delete everything
    if (this.everything.size === 0) {
      // no-op -- no data so deleting is trivial
      return this;
    }
    let { changes } = this.changes;
    const remove = this.select(where);
    if (remove.size === this.everything.size) {
      // actually deleting everything; easy special cases
      changes = changes.union(
        this.records.filter(record => record != null).map(this.primary_key_cols)
      );
      return new DBDocument(
        this.primary_keys,
        this.string_cols,
        undefined,
        undefined,
        undefined,
        { changes, from_db: this.changes.from_db }
      );
    }

    // remove matches from every index
    let indexes = this.indexes;
    for (let field of this.primary_keys) {
      let index = indexes.get(field);
      if (index == null) {
        continue;
      }
      remove.map(n => {
        const record = this.records.get(n);
        const val = record.get(field);
        if (val != null) {
          const k = to_key(val);
          const matches = index.get(k).delete(n);
          if (matches.size === 0) {
            index = index.delete(k);
          } else {
            index = index.set(k, matches);
          }
          indexes = indexes.set(field, index);
        }
      });
    }

    // delete corresponding records (actually set to undefined to
    // preserve index references).
    let records = this.records;
    remove.map(n => {
      changes = changes.add(this.primary_key_cols(records.get(n)));
      records = records.set(n, undefined);
    });

    const everything = this.everything.subtract(remove);

    return new DBDocument(
      this.primary_keys,
      this.string_cols,
      records,
      everything,
      indexes,
      { changes, from_db: this.changes.from_db }
    );
  }

  // Returns immutable list of all matches
  public get(where: WhereCondition): Records {
    const matches = this.select(where);
    if (matches == null) {
      return immutable.List();
    }
    return this.records.filter((x, n) => matches.includes(n));
  }

  // Returns the first match, or undefined if there are no matches
  get_one(where: WhereCondition): Record | undefined {
    // TODO: couldn't select have a shortcut to return once one
    // result is found.
    const matches = this.select(where);
    if (matches == null) {
      return;
    }
    return this.records.get(matches.first());
  }

  // x = javascript object
  private primary_key_part(x: Map<string, any>): Map<string, any> {
    const where: Map<string, any> = {};
    for (let k in x) {
      const v = x[k];
      if (this.primary_keys.has(k)) {
        where[k] = v;
      }
    }
    return where;
  }

  // Return immutable set of primary keys of records that
  // change in going from this to other.
  private changed_keys(other: DBDocument): immutable.Set<string> {
    if (this.records === other.records) {
      // identical -- obviously, nothing changed.
      return immutable.Set();
    }
    // Get the defined records; there may be undefined ones due
    // to lazy delete.
    let t0 = immutable.Set(this.records).filter(x => x != null);
    let t1 = immutable.Set(other.records).filter(x => x != null);

    // Remove the common intersection -- nothing going on there.
    // Doing this greatly reduces the complexity in the common
    // case in which little has changed
    const common = t0.intersect(t1);
    t0 = t0.subtract(common);
    t1 = t1.subtract(common);

    // compute the key parts of t0 and t1 as sets
    const k0 = t0.map(this.primary_key_cols);
    const k1 = t1.map(this.primary_key_cols);

    return k0.union(k1);
  }
}

export function from_str(
  s: string,
  primary_keys: string[],
  string_cols: string[]
): DBDocument {
  const obj: Map<string, any>[] = [];
  for (let line of s.split("\n")) {
    if (line.length > 0) {
      try {
        const x = JSON.parse(line);
        if (typeof x === "object") {
          obj.push(x);
        } else {
          throw Error("each line must be an object");
        }
      } catch (e) {
        console.warn(`CORRUPT db-doc string: ${e} -- skipping '${line}'`);
      }
    }
  }
  return new DBDocument(primary_keys, string_cols, immutable.fromJS(obj));
}
