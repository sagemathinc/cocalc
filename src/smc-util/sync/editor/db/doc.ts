import { CompressedPatch, Document } from "../generic/types";
import * as immutable from "immutable";
import { isEqual } from "underscore";

import { is_array, is_object, copy_without } from "../../../misc";

import { len } from "../../../misc2";

import {
  make_patch as string_make_patch,
  apply_patch as string_apply_patch
} from "../generic/util";
import {
  map_merge_patch,
  merge_set,
  nonnull_cols,
  to_key,
  to_str
} from "./util";

type Record = immutable.Map<string, any> | undefined;
type Records = immutable.List<Record>;
type Index = immutable.Map<string, immutable.Set<number>>;
type Indexes = immutable.Map<string, Index>;

type jsmap = { [field: string]: any };

export type WhereCondition = { [field: string]: any };
export type SetCondition =
  | immutable.Map<string, any>
  | { [field: string]: any };

interface ChangeTracker {
  changes: immutable.Set<immutable.Map<string, any>>; // primary keys that changed
  from_db: Document; // DBDocument object where change tracking started.
}

// Immutable DB document
export class DBDocument implements Document {
  private primary_keys: Set<string>;

  // Columns that should be treated as non-atomic strings.
  // This means simultaneous changes by multiple clients are
  // merged, instead of last-write-wins.  Also, large changes
  // are propagated at patches, rather than sending
  // complete string.
  private string_cols: Set<string>;

  // list of records -- each is assumed to be an immutable.Map.
  private records: immutable.List<Record>;

  // set of numbers n such that records.get(n) is defined.
  private everything: immutable.Set<number>;

  // TODO: describe
  private indexes: Indexes;

  // Change tracking.
  private change_tracker: ChangeTracker;

  public readonly size: number;

  private to_str_cache?: string;

  constructor(
    primary_keys: Set<string>,
    string_cols: Set<string>,
    records: Records = immutable.List(),
    everything?: immutable.Set<number>,
    indexes?: Indexes,
    change_tracker?: ChangeTracker
  ) {
    this.set = this.set.bind(this);
    this.delete_array = this.delete_array.bind(this);
    this.primary_key_cols = this.primary_key_cols.bind(this);
    this.primary_key_part = this.primary_key_part.bind(this);

    this.primary_keys = new Set(primary_keys);
    if (this.primary_keys.size === 0) {
      throw Error("there must be at least one primary key");
    }
    this.string_cols = new Set(string_cols);
    this.records = records;
    this.everything = everything == null ? this.init_everything() : everything;
    this.size = this.everything.size;
    this.indexes = indexes == null ? this.init_indexes() : indexes;
    this.change_tracker =
      change_tracker == null ? this.init_change_tracker() : change_tracker;
  }

  // sorted immutable Set of i such that this.records.get(i) is defined.
  private init_everything(): immutable.Set<number> {
    const v: number[] = [];
    for (let n = 0; n < this.records.size; n++) {
      if (this.records.get(n) != undefined) {
        v.push(n);
      }
    }
    return immutable.Set(v);
  }

  private init_indexes(): Indexes {
    // Build indexes
    let indexes: Indexes = immutable.Map();
    for (let field of this.primary_keys) {
      const index: Index = immutable.Map();
      indexes = indexes.set(field, index);
    }
    this.records.map((record: Record, n: number) => {
      if (record == null) {
        // null records are sentinels for deletions.
        return;
      }
      indexes.map((index: Index, field: string) => {
        const val = record.get(field);
        if (val != null) {
          const k: string = to_key(val);
          let matches = index.get(k);
          if (matches != null) {
            matches = matches.add(n);
          } else {
            matches = immutable.Set([n]);
          }
          indexes = indexes.set(field, index.set(k, matches));
        }
      });
    });
    return indexes;
  }

  private init_change_tracker(): ChangeTracker {
    return { changes: immutable.Set(), from_db: this };
  }

  public to_str(): string {
    if (this.to_str_cache != null) {
      // We can use a cache, since this is an immutable object
      return this.to_str_cache;
    }
    const obj = this.get({}).toJS();
    return (this.to_str_cache = to_str(obj));
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
    let db: DBDocument = this;
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
      const v: jsmap[] = [];
      t0.map(x => {
        if (x != null) {
          v.push(this.primary_key_part(x.toJS()));
        }
      });
      return [-1, v];
    }

    // compute the key parts of t0 and t1 as sets
    // means -- set got from t0 by taking only the primary_key columns
    // (Why the "as"? Typescript makes the output of the map be of type
    //        Iterable<Record, Iterable<string, any>>
    // But, it's just a set.  So cast it.)
    const k0 = t0.map(this.primary_key_cols) as immutable.Set<Record>;
    const k1 = t1.map(this.primary_key_cols) as immutable.Set<Record>;

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
        if (k != null) {
          const x = other.get_one(k);
          if (x != null) {
            add.push(x.toJS());
          }
        }
      });
    }

    // Everything in k1 that is also in k0 -- these
    // must have all changed
    const changed = k1.intersect(k0);
    if (changed.size > 0) {
      changed.map(k => {
        if (k == null) {
          return;
        }
        const obj = k.toJS();
        const obj0 = this.primary_key_part(obj);
        const from0 = this.get_one(obj0);
        const to0 = other.get_one(obj0);
        if (from0 == null || to0 == null) {
          // just to make typescript happy
          return;
        }
        const from = from0.toJS();
        const to = to0.toJS();
        // undefined for each key of from not in to
        for (let key in from) {
          if (to[key] == null) {
            obj[key] = null;
          }
        }
        // Explicitly set each key of `to` that is different
        // than corresponding key of `from`:
        for (let key in to) {
          const v = to[key];
          if (!isEqual(from[key], v)) {
            if (this.string_cols.has(key) && from[key] != null && v != null) {
              // A string patch
              obj[key] = string_make_patch(from[key], v);
            } else if (is_object(from[key]) && is_object(v)) {
              // Changing from one map to another, where they are not
              // equal -- can use a merge to make this more efficient.
              // This is an important optimization, to avoid making
              // patches HUGE.
              obj[key] = map_merge_patch(from[key], v);
            } else {
              obj[key] = v;
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
    return f.filter(
      (_, k) => k != null && this.primary_keys.has(k)
    ) as immutable.Map<string, any>;
  }

  private select(where: WhereCondition): immutable.Set<number> {
    if (immutable.Map.isMap(where)) {
      // TODO: maybe do not allow?
      where = where.toJS();
    }
    // Return immutable set with defined indexes the elts of @_records that
    // satisfy the where condition.
    const n: number = len(where);
    let result: immutable.Set<number> | undefined = undefined;
    for (let field in where) {
      const value = where[field];
      const index = this.indexes.get(field);
      if (index == null) {
        throw Error(`field '${field}' must be a primary key`);
      }
      const v: immutable.Set<number> | undefined = index.get(to_key(value));
      // v may be undefined here
      if (v == null) {
        return immutable.Set(); // no matches for this field - done
      }
      if (n === 1) {
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
  private parse(obj: Map<string, any>): { where: jsmap; set: jsmap } {
    const where: jsmap = {};
    const set: jsmap = {};
    for (let field in obj) {
      const val = obj[field];
      if (this.primary_keys.has(field)) {
        if (val != null) {
          where[field] = val;
        }
      } else {
        set[field] = val;
      }
    }
    return { where, set };
  }

  public set(obj: SetCondition | SetCondition[]): DBDocument {
    if (is_array(obj)) {
      let z: DBDocument = this;
      for (let x of obj as SetCondition[]) {
        z = z.set(x);
      }
      return z;
    }
    if (immutable.Map.isMap(obj)) {
      // TODO: maybe do not allow?
      // it is very clean/convenient to allow this
      obj = (obj as immutable.Map<string, any>).toJS();
    }
    const { set, where } = this.parse(obj as Map<string, any>);
    const matches = this.select(where);
    let { changes } = this.change_tracker;
    const first_match = matches != null ? matches.min() : undefined;
    if (first_match != null) {
      // edit the first existing record that matches
      let record = this.records.get(first_match);
      if (record == null) {
        // make typescript happier.
        throw Error("bug -- record can't be null");
      }
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
              string_apply_patch(value, before.get(field, ""))[0]
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
          this.records.set(first_match, record),
          this.everything,
          this.indexes,
          { changes, from_db: this.change_tracker.from_db }
        );
      } else {
        return this;
      }
    } else {
      // The sparse array matches had nothing in it, so
      // append a new record.
      for (let field in this.string_cols) {
        if (obj[field] != null && is_array(obj[field])) {
          // It's a patch -- but there is nothing to patch,
          // so discard this field
          obj = copy_without(obj, field);
        }
      }
      // remove null columns (null indicates delete)
      const record = nonnull_cols(immutable.fromJS(obj));
      changes = changes.add(this.primary_key_cols(record));
      const records = this.records.push(record);
      const n = records.size - 1;
      const everything = this.everything.add(n);
      // update indexes
      let indexes = this.indexes;
      for (let field of this.primary_keys) {
        const val = obj[field];
        if (val != null) {
          let index = indexes.get(field);
          if (index == null) {
            index = immutable.Map();
          }
          const k = to_key(val);
          let matches = index.get(k);
          if (matches != null) {
            matches = matches.add(n);
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
        { changes, from_db: this.change_tracker.from_db }
      );
    }
  }

  private delete_array(where: WhereCondition[]): DBDocument {
    let z = this as DBDocument;
    for (let x of where) {
      z = z.delete(x);
    }
    return z;
  }

  public delete(where: WhereCondition | WhereCondition[]): DBDocument {
    // console.log("delete #{JSON.stringify(where)}")
    if (is_array(where)) {
      return this.delete_array(where as WhereCondition[]);
    }
    // if where undefined, will delete everything
    if (this.everything.size === 0) {
      // no-op -- no data so deleting is trivial
      return this;
    }
    let { changes } = this.change_tracker;
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
        { changes, from_db: this.change_tracker.from_db }
      );
    }

    // remove matches from every index
    let indexes = this.indexes;
    for (let field of this.primary_keys) {
      let index = indexes.get(field);
      if (index == null) {
        continue;
      }
      remove.forEach(n => {
        if (n == null) {
          return;
        }
        const record = this.records.get(n);
        if (record == null) {
          return;
        }
        const val = record.get(field);
        if (val == null) {
          return;
        }
        const k = to_key(val);
        const matches = index.get(k).delete(n);
        if (matches.size === 0) {
          index = index.delete(k);
        } else {
          index = index.set(k, matches);
        }
        indexes = indexes.set(field, index);
      });
    }

    // delete corresponding records (actually set to undefined to
    // preserve index references).
    let records = this.records;
    remove.forEach(n => {
      if (n == null) {
        return;
      }
      const record = records.get(n);
      if (record == null) {
        return;
      }
      changes = changes.add(this.primary_key_cols(record));
      records = records.set(n, undefined);
    });

    const everything = this.everything.subtract(remove);

    return new DBDocument(
      this.primary_keys,
      this.string_cols,
      records,
      everything,
      indexes,
      { changes, from_db: this.change_tracker.from_db }
    );
  }

  // Returns immutable list of all matches
  public get(where: WhereCondition): Records {
    const matches = this.select(where);
    if (matches == null) {
      return immutable.List();
    }
    // The "as" is because Typescript just makes the result of
    // filter some more generic type (but it isn't).
    return immutable.List(
      this.records.filter((_, n) => n != null && matches.includes(n))
    );
  }

  // Returns the first match, or undefined if there are no matches
  get_one(where: WhereCondition): Record | undefined {
    // TODO: couldn't select have a shortcut to return once one
    // result is found.
    const matches = this.select(where);
    if (matches == null) {
      return;
    }
    return this.records.get(matches.min());
  }

  // x = javascript object
  private primary_key_part(x: jsmap): jsmap {
    const where: jsmap = {};
    for (let k in x) {
      const v = x[k];
      if (this.primary_keys.has(k)) {
        where[k] = v;
      }
    }
    return where;
  }

  // Return immutable set of primary key parts of records that
  // change in going from this to other.
  public changed_keys(other: DBDocument): immutable.Set<Record> {
    if (this.records === other.records) {
      // identical -- obviously, nothing changed.
      return immutable.Set();
    }
    // Get the defined records; there may be undefined ones due
    // to lazy delete.
    let t0: immutable.Set<Record> = immutable.Set(
      immutable.Set(this.records).filter(x => x != null)
    );
    let t1: immutable.Set<Record> = immutable.Set(
      immutable.Set(other.records).filter(x => x != null)
    );

    // Remove the common intersection -- nothing going on there.
    // Doing this greatly reduces the complexity in the common
    // case in which little has changed
    const common = t0.intersect(t1);
    t0 = t0.subtract(common);
    t1 = t1.subtract(common);

    // compute the key parts of t0 and t1 as sets
    const k0 = immutable.Set(t0.map(this.primary_key_cols));
    const k1 = immutable.Set(t1.map(this.primary_key_cols));

    return immutable.Set(k0.union(k1));
  }

  public changes(prev?: DBDocument): immutable.Set<Record> {
    // CRITICAL TODO!  Make this efficient using this.change_tracker!!!
    if (prev == null) {
      return immutable.Set(
        immutable
          .Set(this.records)
          .filter(x => x != null)
          .map(this.primary_key_cols)
      );
    }
    return this.changed_keys(prev);
  }

  public count(): number {
    return this.size;
  }
}

/*
The underlying string representation has one JSON object
per line.  The order doesn't matter.

WARNING: The primary keys and string cols are NOT stored
in the string representation!  That is metadata that must
somehow be tracked separately.  (Maybe this should be changed).

You can't store null since null is used to signify deleting
(in set queries). You can't store undefined or Date objects
due to JSON.

Also, note that the primary_keys and string_cols are string[]
rather than Set of strings, which is annoyingly inconsistent
with DBDocument above.
*/

export function from_str(
  s: string,
  primary_keys: string[],
  string_cols: string[]
): DBDocument {
  const obj: jsmap[] = [];
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
  return new DBDocument(
    new Set(primary_keys),
    new Set(string_cols),
    immutable.fromJS(obj)
  );
}
