class Doc {
  constructor(_db) {
    this.to_str = this.to_str.bind(this);
    this.is_equal = this.is_equal.bind(this);
    this.apply_patch = this.apply_patch.bind(this);
    this.make_patch = this.make_patch.bind(this);
    this.changes = this.changes.bind(this);
    this.reset_changes = this.reset_changes.bind(this);
    this.get = this.get.bind(this);
    this.get_one = this.get_one.bind(this);
    this._db = _db;
    if (this._db == null) {
      throw Error("@_db must be defined");
    }
  }

  to_str() {
    return this._db.to_str();
  }

  is_equal(other) {
    if (other == null) {
      // Definitely not equal if not defined -- this should never get called, but other bugs could lead
      // here, so we handle it sensibly here at least.  See, e.g., https://github.com/sagemathinc/cocalc/issues/2586
      return false;
    }
    return this._db.equals(other._db);
  }

  apply_patch(patch) {
    //console.log("apply_patch")
    return new Doc(this._db.apply_patch(patch));
  }

  make_patch(other) {
    if (this._db == null || (other != null ? other._db : undefined) == null) {
      // not initialized or closed, etc., -- undefined means done.
      return;
    }
    return this._db.make_patch(other._db);
  }

  changes() {
    return this._db.changes();
  }

  reset_changes() {
    this._db.reset_changes();
  }

  get(where) {
    return this._db != null ? this._db.get(where) : undefined;
  }

  get_one(where) {
    return this._db != null ? this._db.get_one(where) : undefined;
  }
}

class SyncDoc extends syncstring.SyncDoc {
  constructor(opts) {
    opts = defaults(opts, {
      client: required,
      project_id: undefined,
      path: undefined,
      save_interval: undefined,
      patch_interval: undefined,
      file_use_interval: undefined,
      cursors: false,
      primary_keys: required,
      string_cols: []
    });

    const from_str = function(str) {
      const db = exports.from_str({
        str,
        primary_keys: opts.primary_keys,
        string_cols: opts.string_cols
      });
      return new Doc(db);
    };

    super({
      string_id: opts.id,
      client: opts.client,
      project_id: opts.project_id,
      path: opts.path,
      save_interval: opts.save_interval,
      patch_interval: opts.patch_interval,
      file_use_interval: opts.file_use_interval,
      cursors: opts.cursors,
      from_str,
      doctype: {
        type: "db",
        patch_format: 1,
        opts: {
          primary_keys: opts.primary_keys,
          string_cols: opts.string_cols
        }
      }
    });
  }
}
