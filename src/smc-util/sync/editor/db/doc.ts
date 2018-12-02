/*
import immutable from "immutable";
import underscore from "underscore";

import syncstring from "./syncstring";

import misc from "./misc";

const { required, defaults } = misc;

import { EventEmitter } from "events";

// Well-defined JSON.stringify...
import json_stable from "json-stable-stringify";
const to_key = function(s) {
  if (immutable.Map.isMap(s)) {
    s = s.toJS();
  }
  return json_stable(s);
};

export function db_doc(opts) {
  opts = defaults(opts, {
    primary_keys: required,
    string_cols: []
  });
  if (!misc.is_array(opts.primary_keys)) {
    throw Error("primary_keys must be an array");
  }
  if (!misc.is_array(opts.string_cols)) {
    throw Error("_string_cols must be an array");
  }
  return new DBDoc(opts.primary_keys, opts.string_cols);
}

// Create a DBDoc from a plain javascript object
export function from_obj(opts) {
  opts = defaults(opts, {
    obj: required,
    primary_keys: required,
    string_cols: []
  });
  if (!misc.is_array(opts.obj)) {
    throw Error("obj must be an array");
  }
  // Set the data
  const records = immutable.fromJS(opts.obj);
  return new DBDoc(opts.primary_keys, opts.string_cols, records);
}

export function from_str(opts) {
  opts = defaults(opts, {
    str: required,
    primary_keys: required,
    string_cols: []
  });
  if (!misc.is_string(opts.str)) {
    throw Error("obj must be a string");
  }
  const obj = [];
  for (let line of opts.str.split("\n")) {
    if (line.length > 0) {
      try {
        obj.push(misc.from_json(line));
      } catch (e) {
        console.warn(`CORRUPT db-doc string: ${e} -- skipping '${line}'`);
      }
    }
  }
  return exports.from_obj({
    obj,
    primary_keys: opts.primary_keys,
    string_cols: opts.string_cols
  });
}

// obj and change are both immutable.js Maps.  Do the following:
//  - for each value of change that is null or undefined, we delete that key from obj
//  - we set the other vals of obj, accordingly.
// So this is a shallow merge with the ability to *delete* keys.
const merge_set = function(obj, change) {
  //#return obj.merge(change).filter((v,k) => v != null)
  change.map(function(v, k) {
    if (v === null || v == null) {
      obj = obj.delete(k);
    } else {
      obj = obj.set(k, v);
    }
  });
  return obj;
};

// Create an object change such that merge_set(obj1, change) produces obj2.
// Thus for each key, value1 of obj1 and key, value2 of obj2:
//  If value1 is the same as value2, do nothing.
//  If value1 exists but value2 does not, do change[key] = null
//  If value2 exists but value1 does not, do change[key] = value2
const map_merge_patch = function(obj1, obj2) {
  let val2;
  const change = {};
  for (var key in obj1) {
    const val1 = obj1[key];
    val2 = obj2[key];
    if (underscore.isEqual(val1, val2)) {
      // nothing to do
    } else if (val2 == null) {
      change[key] = null;
    } else {
      change[key] = val2;
    }
  }
  for (key in obj2) {
    val2 = obj2[key];
    if (obj1[key] != null) {
      continue;
    }
    change[key] = val2;
  }
  return change;
};

const nonnull_cols = f => f.filter((v, k) => v !== null);

export class DBDoc {
  constructor(
    _primary_keys,
    _string_cols,
    _records,
    _everything,
    _indexes,
    _changes
  ) {
    this.reset_changes = this.reset_changes.bind(this);
    this.changes = this.changes.bind(this);
    this._primary_key_cols = this._primary_key_cols.bind(this);
    this._process_cols = this._process_cols.bind(this);
    this._select = this._select.bind(this);
    this._parse = this._parse.bind(this);
    this.set = this.set.bind(this);
    this.delete = this.delete.bind(this);
    this.get = this.get.bind(this);
    this.get_one = this.get_one.bind(this);
    this.equals = this.equals.bind(this);
    this.to_obj = this.to_obj.bind(this);
    this.to_str = this.to_str.bind(this);
    this._primary_key_part = this._primary_key_part.bind(this);
    this.make_patch = this.make_patch.bind(this);
    this.apply_patch = this.apply_patch.bind(this);
    this.changed_keys = this.changed_keys.bind(this);
    let n;
    this._primary_keys = _primary_keys;
    this._string_cols = _string_cols;
    this._records = _records;
    this._everything = _everything;
    this._indexes = _indexes;
    this._changes = _changes;
    this._primary_keys = this._process_cols(this._primary_keys);
    this._string_cols = this._process_cols(this._string_cols);
    // list of records -- each is assumed to be an immutable.Map.
    if (this._records == null) {
      this._records = immutable.List();
    }
    // sorted set of i such that @_records.get(i) is defined.
    if (this._everything == null) {
      this._everything = immutable
        .Set(
          (() => {
            let asc, end;
            const result = [];
            for (
              n = 0, end = this._records.size, asc = 0 <= end;
              asc ? n < end : n > end;
              asc ? n++ : n--
            ) {
              if (this._records.get(n) != null) {
                result.push(n);
              }
            }
            return result;
          })()
        )
        .sort();
    }
    if (this._indexes == null) {
      // Build indexes
      this._indexes = immutable.Map(); // from field to Map
      for (let field in this._primary_keys) {
        this._indexes = this._indexes.set(field, immutable.Map());
      }
      n = 0;
      this._records.map((record, n) => {
        this._indexes.map((index, field) => {
          const val = record.get(field);
          if (val != null) {
            const k = to_key(val);
            let matches = index.get(k);
            if (matches != null) {
              matches = matches.add(n).sort();
            } else {
              matches = immutable.Set([n]);
            }
            this._indexes = this._indexes.set(field, index.set(k, matches));
          }
        });
      });
    }
    this.size = this._everything.size;
    if (this._changes == null) {
      this.reset_changes();
    }
  }

  reset_changes() {
    return (this._changes = { changes: immutable.Set(), from_db: this });
  }

  // Returns object {changes: an immutable set of primary keys, from_db: db object where change tracking started}
  changes() {
    return this._changes;
  }

  // Given an immutable map f, return its restriction to the primary keys
  _primary_key_cols(f) {
    return f.filter((v, k) => this._primary_keys[k]);
  }

  // Given an immutable map f, return its restriction to only keys that
  // have non-null defined values.
  _process_cols(v) {
    if (misc.is_array(v)) {
      const p = {};
      for (let field of v) {
        p[field] = true;
      }
      return p;
    } else if (!misc.is_object(v)) {
      throw Error("primary_keys must be a map or array");
    }
    return v;
  }

  _select(where) {
    if (immutable.Map.isMap(where)) {
      where = where.toJS();
    }
    // Return immutable set with defined indexes the elts of @_records that
    // satisfy the where condition.
    const len = misc.len(where);
    let result = undefined;
    for (let field in where) {
      const value = where[field];
      const index = this._indexes.get(field);
      if (index == null) {
        throw Error(`field '${field}' must be a primary key`);
      }
      // v is an immutable.js set or undefined
      const v = index.get(to_key(value)); // v may be undefined here, so important to do the v? check first!
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
      return this._everything;
    } else {
      return result;
    }
  }

  // Used internally for determining the set/where parts of an object.
  _parse(obj) {
    if (immutable.Map.isMap(obj)) {
      // it is very clean/convenient to allow this
      obj = obj.toJS();
    }
    if (!misc.is_object(obj)) {
      throw Error("obj must be a Javascript object");
    }
    const where = {};
    const set = {};
    for (let field in obj) {
      const val = obj[field];
      if (this._primary_keys[field] != null) {
        if (val != null) {
          where[field] = val;
        }
      } else {
        set[field] = val;
      }
    }
    return { where, set, obj }; // return obj, in case had to convert from immutable
  }

  set(obj) {
    let field, record, set, where;
    if (misc.is_array(obj)) {
      let z = this;
      for (let x of obj) {
        z = z.set(x);
      }
      return z;
    }
    ({ where, set, obj } = this._parse(obj));
    // console.log("set #{misc.to_json(set)}, #{misc.to_json(where)}")
    let matches = this._select(where);
    let { changes } = this._changes;
    let n = matches != null ? matches.first() : undefined;
    // TODO: very natural optimization would be be to fully support and use obj being immutable
    if (n != null) {
      // edit the first existing record that matches
      const before = (record = this._records.get(n));
      for (field in set) {
        const value = set[field];
        if (value === null) {
          // null = how to delete fields
          record = record.delete(field);
        } else {
          if (this._string_cols[field] && misc.is_array(value)) {
            // special case: a string patch
            var left;
            record = record.set(
              field,
              syncstring.apply_patch(
                value,
                (left = before.get(field)) != null ? left : ""
              )[0]
            );
          } else {
            var new_val;
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
        // there was an actual change, so update; doesn't change anything involving indexes.
        changes = changes.add(this._primary_key_cols(record));
        return new DBDoc(
          this._primary_keys,
          this._string_cols,
          this._records.set(n, record),
          this._everything,
          this._indexes,
          { changes, from_db: this._changes.from_db }
        );
      } else {
        return this;
      }
    } else {
      // The sparse array matches had nothing in it, so append a new record.
      for (field in this._string_cols) {
        if (obj[field] != null && misc.is_array(obj[field])) {
          // it's a patch -- but there is nothing to patch, so discard this field
          obj = misc.copy_without(obj, field);
        }
      }
      record = nonnull_cols(immutable.fromJS(obj)); // remove null columns (indicate delete)
      changes = changes.add(this._primary_key_cols(record));
      const records = this._records.push(record);
      n = records.size - 1;
      const everything = this._everything.add(n);
      // update indexes
      let indexes = this._indexes;
      for (field in this._primary_keys) {
        const val = obj[field];
        if (val != null && val !== null) {
          var left1;
          const index =
            (left1 = indexes.get(field)) != null ? left1 : immutable.Map();
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
      return new DBDoc(
        this._primary_keys,
        this._string_cols,
        records,
        everything,
        indexes,
        { changes, from_db: this._changes.from_db }
      );
    }
  }

  delete(where) {
    if (misc.is_array(where)) {
      let z = this;
      for (let x of where) {
        z = z.delete(x);
      }
      return z;
    }
    // console.log("delete #{misc.to_json(where)}")
    // if where undefined, will delete everything
    if (this._everything.size === 0) {
      // no-op -- no data so deleting is trivial
      return this;
    }
    let { changes } = this._changes;
    const remove = this._select(where);
    if (remove.size === this._everything.size) {
      // actually deleting everything; easy special cases
      changes = changes.union(
        this._records
          .filter(record => record != null)
          .map(this._primary_key_cols)
      );
      return new DBDoc(
        this._primary_keys,
        this._string_cols,
        undefined,
        undefined,
        undefined,
        { changes, from_db: this._changes.from_db }
      );
    }

    // remove matches from every index
    let indexes = this._indexes;
    for (var field in this._primary_keys) {
      var index = indexes.get(field);
      if (index == null) {
        continue;
      }
      remove.map(n => {
        const record = this._records.get(n);
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

    // delete corresponding records (actually set to undefined)
    let records = this._records;
    remove.map(n => {
      changes = changes.add(this._primary_key_cols(records.get(n)));
      return (records = records.set(n, undefined));
    });

    const everything = this._everything.subtract(remove);

    return new DBDoc(
      this._primary_keys,
      this._string_cols,
      records,
      everything,
      indexes,
      { changes, from_db: this._changes.from_db }
    );
  }

  // Returns immutable list of all matches
  get(where) {
    const matches = this._select(where);
    if (matches == null) {
      return immutable.List();
    }
    return this._records.filter((x, n) => matches.includes(n));
  }

  // Returns the first match, or undefined if there are no matches
  get_one(where) {
    const matches = this._select(where);
    if (matches == null) {
      return;
    }
    return this._records.get(matches.first());
  }

  equals(other) {
    if (this._records === other._records) {
      return true;
    }
    if (this.size !== other.size) {
      return false;
    }
    return immutable
      .Set(this._records)
      .add(undefined)
      .equals(immutable.Set(other._records).add(undefined));
  }

  // Conversion to and from an array of records, which is the primary key list followed by the normal Javascript objects
  to_obj() {
    return this.get().toJS();
  }

  to_str() {
    if (this._to_str_cache != null) {
      // save to cache since this is an immutable object
      return this._to_str_cache;
    }
    const v = this.to_obj().map(x => misc.to_json(x));
    // NOTE: It is *VERY* important to sort this!  Otherwise, the hash of this document, which is used by
    // syncstring, isn't stable in terms of the value of the document.  This can in theory
    // cause massive trouble with file saves, e.g., of jupyter notebooks, courses, etc. (They save fine, but
    // they appear not to for the user...).
    v.sort();
    return (this._to_str_cache = v.join("\n"));
  }

  // x = javascript object
  _primary_key_part(x) {
    const where = {};
    for (let k in x) {
      const v = x[k];
      if (this._primary_keys[k]) {
        where[k] = v;
      }
    }
    return where;
  }

  make_patch(other) {
    let v;
    if (other.size === 0) {
      // Special case -- delete everything
      return [-1, [{}]];
    }

    let t0 = immutable.Set(this._records);
    let t1 = immutable.Set(other._records);
    // Remove the common intersection -- nothing going on there.
    // Doing this greatly reduces the complexity in the common case in which little has changed
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
      v = [];
      t0.map(x => {
        v.push(this._primary_key_part(x.toJS()));
      });
      return [-1, v];
    }

    // compute the key parts of t0 and t1 as sets
    // means -- set got from t0 by taking only the primary_key columns
    const k0 = t0.map(this._primary_key_cols);
    const k1 = t1.map(this._primary_key_cols);

    const add = [];
    let remove = undefined;

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

    // Everything in k1 that is also in k0 -- these must have all changed
    const changed = k1.intersect(k0);
    if (changed.size > 0) {
      changed.map(k => {
        const obj = k.toJS();
        const obj0 = this._primary_key_part(obj);
        const from = this.get_one(obj0).toJS();
        const to = other.get_one(obj0).toJS();
        // undefined for each key of from not in to
        for (k in from) {
          if (to[k] == null) {
            obj[k] = null;
          }
        }
        // explicitly set each key of to that is different than corresponding key of from
        for (k in to) {
          v = to[k];
          if (!underscore.isEqual(from[k], v)) {
            if (this._string_cols[k] && from[k] != null && v != null) {
              // A string patch
              obj[k] = syncstring.make_patch(from[k], v);
            } else if (misc.is_object(from[k]) && misc.is_object(v)) {
              // Changing from one map to another, where they are not equal -- can use
              // a merge to make this more efficient.  This is an important optimization,
              // to avoid making patches HUGE.
              obj[k] = map_merge_patch(from[k], v);
            } else {
              obj[k] = v;
            }
          }
        }
        add.push(obj);
      });
    }

    const patch = [];
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

  apply_patch(patch) {
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

  // Return immutable set of primary keys of records that change in going from @ to other.
  changed_keys(other) {
    if (this._records === (other != null ? other._records : undefined)) {
      // identical
      return immutable.Set();
    }
    let t0 = immutable.Set(this._records).filter(x => x != null); // defined records
    if (other == null) {
      return t0.map(this._primary_key_cols);
    }

    let t1 = immutable.Set(other._records).filter(x => x != null);

    // Remove the common intersection -- nothing going on there.
    // Doing this greatly reduces the complexity in the common case in which little has changed
    const common = t0.intersect(t1);
    t0 = t0.subtract(common);
    t1 = t1.subtract(common);

    // compute the key parts of t0 and t1 as sets
    const k0 = t0.map(this._primary_key_cols);
    const k1 = t1.map(this._primary_key_cols);
    return k0.union(k1);
  }
}

*/