// Schema for synchronized editing of strings.

import { Table } from "./types";
import { deep_copy, minutes_ago } from "../misc";
import { SCHEMA as schema } from "./index";

export const DEFAULT_SNAPSHOT_INTERVAL = 300;

Table({
  name: "syncstrings",
  fields: {
    string_id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "id of this synchronized string -- sha1 hash of (project_id and path)",
    },
    project_id: {
      type: "uuid",
      desc: "id of project that this synchronized string belongs to",
      render: { type: "project_link" },
    },
    last_active: {
      type: "timestamp",
      desc: 'when a user most-recently "cared" about this syncstring (syncstring will be automatically opened in running project if last_active is sufficiently recent)',
    },
    last_file_change: {
      type: "timestamp",
      desc: "when file on disk last changed not due to save (used by Jupyter sync)",
    },
    path: {
      type: "string",
      desc: "optional path of file being edited",
    },
    deleted: {
      type: "boolean",
      desc: "DEPRECATED (remove this field in a few months from March 2020, when no client is using it)",
    },
    init: {
      type: "map",
      desc: "{time:timestamp, error:?} - info about what happened when project tried to initialize this string",
      date: ["time"],
    },
    save: {
      type: "map",
      desc: "{state:['requested', 'done'], hash:misc.hash_string(what was last saved), expected_hash:?, error:['' or 'error message']}",
    },
    read_only: {
      type: "boolean",
      desc: "true or false, depending on whether this syncstring is readonly or can be edited",
    },
    users: {
      type: "array",
      pg_type: "UUID[]",
      desc: "array of account_id's of those who have edited this string. Index of account_id in this array is used to represent patch authors.",
      render: { type: "accounts" },
    },
    last_snapshot: {
      type: "timestamp",
      desc: "timestamp of a recent snapshot; if not given, assume no snapshots.  This is used to restrict the range of patches that have to be downloaded in order start editing the file.",
    },
    last_seq: {
      type: "number",
      desc: "sequence number of patch that snapshot was last made for",
    },
    snapshot_interval: {
      type: "integer",
      desc: "If m=snapshot_interval is given and there are a total of n patches, then we (some user) should make snapshots at patches m, 2*m, ..., k, where k<=n-m.",
    },
    archived: {
      type: "uuid",
      desc: "if set, then syncstring patches array have been archived in the blob with given uuid.",
    },
    doctype: {
      type: "string",
      desc: "(REQUIRED) JSON string describing meaning of the patches (i.e., of this document0 -- e.g., {type:'db', opts:{primary_keys:['id'], string_cols:['name']}}",
    },
    settings: {
      type: "map",
      desc: "Shared (by all users) configuration settings for editing this file (e.g., which spellcheck language to use).",
    },
    huge: {
      type: "boolean",
      desc: "If true, this syncstring contains too many or too large patches to be processed. Hence if this is set, it won't be processed. TODO: implement a better archiving mechanism and then process such 'huge' syncstrings.",
    },
  },
  rules: {
    primary_key: "string_id",

    pg_indexes: ["last_active", "archived"],

    user_query: {
      get: {
        fields: {
          string_id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          users: null,
          last_snapshot: null,
          last_seq: null,
          snapshot_interval: DEFAULT_SNAPSHOT_INTERVAL,
          project_id: null,
          path: null,
          deleted: null,
          save: null,
          last_active: null,
          init: null,
          read_only: null,
          last_file_change: null,
          doctype: null,
          archived: null,
          settings: null,
        },
        required_fields: {
          path: true,
          project_id: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstrings_check(obj, account_id, project_id, cb);
        },
      },

      set: {
        fields: {
          // That string_id must be sha1(project_id,path) means
          // user can only ever query one entry from THIS table;
          // use recent_syncstrings_in_project below to get many.
          string_id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          users: true,
          last_snapshot: true,
          last_seq: true,
          snapshot_interval: true,
          project_id: true,
          path: true,
          deleted: true,
          save: true,
          last_active: true,
          init: true,
          read_only: true,
          last_file_change: true,
          doctype: true,
          settings: true,
        },
        required_fields: {
          path: true,
          project_id: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstrings_check(obj, account_id, project_id, cb);
        },
        on_change(db, old_val, new_val, account_id, cb) {
          return db._user_set_query_syncstring_change_after(
            old_val,
            new_val,
            account_id,
            cb,
          );
        },
      },
    },
  },
});

Table({
  name: "crm_syncstrings",
  rules: {
    virtual: "syncstrings",
    primary_key: "string_id",
    user_query: {
      get: {
        pg_where: [],
        admin: true, // only admins can do get queries on this table
        fields: {
          ...schema.syncstrings.user_query?.get?.fields,
          string_id: null,
        },
        options: [{ limit: 100 }, { order_by: "-last_active" }],
      },
    },
  },
  fields: schema.syncstrings.fields,
});

schema.syncstrings.project_query = deep_copy(schema.syncstrings.user_query);

Table({
  name: "syncstrings_delete",
  fields: schema.syncstrings.fields,
  rules: {
    primary_key: schema.syncstrings.primary_key,
    virtual: "syncstrings",
    user_query: {
      set: {
        // use set query since selecting only one record by its primary key
        admin: true, // only admins can do queries on this virtual table
        delete: true, // allow deletes
        options: [{ delete: true }], // always delete when doing set on this table, even if not explicitly requested
        fields: {
          string_id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          project_id: true,
          path: true,
        },
        required_fields: {
          project_id: true,
          path: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstrings_check(obj, account_id, project_id, cb);
        },
      },
    },
  },
});

Table({
  name: "recent_syncstrings_in_project",
  fields: {
    string_id: true,
    project_id: true,
    path: true,
    last_active: true,
    deleted: true,
    doctype: true,
  },
  rules: {
    primary_key: "string_id",
    virtual: "syncstrings",
    user_query: {
      get: {
        pg_where(obj) {
          return [
            {
              "project_id = $::UUID": obj.project_id,
              "last_active >= $::TIMESTAMP": minutes_ago(obj.max_age_m),
            },
          ];
        },
        pg_changefeed() {
          // need to do this, since last_active won't
          // be selected automatically, but it is needed by where.
          return {
            select: {
              project_id: "UUID",
              last_active: "TIMESTAMP",
            },
          };
        },
        fields: {
          project_id: null,
          string_id: null,
          last_active: null,
          path: null,
          deleted: null,
          doctype: null,
          // @ts-ignore -- our typings aren't quite good enough for this.
          max_age_m: null,
        },
        required_fields: {
          project_id: true,
          // @ts-ignore
          max_age_m: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstrings_check(obj, account_id, project_id, cb);
        },
      },
    },
  },
});

schema.recent_syncstrings_in_project.project_query =
  schema.recent_syncstrings_in_project.user_query;

Table({
  name: "patches",
  fields: {
    string_id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "id of the syncstring that this patch belongs to.",
    },
    time: {
      type: "timestamp",
      desc: "the logical timestamp of the patch",
    },
    wall: {
      type: "timestamp",
      desc: "the timestamp that we show to the user",
    },
    user_id: {
      type: "integer",
      desc: "a nonnegative integer; this is the index into the syncstrings.users array of account_id's",
    },
    patch: {
      type: "string",
      pg_type: "TEXT", // that's what it is in the database now...
      desc: "JSON string that parses to a patch, which transforms the previous version of the syncstring to this version",
      render: { type: "text" },
    },
    is_snapshot: {
      type: "boolean",
      desc: "True if this is a snapshot (this is only used in NATS).",
    },
    snapshot: {
      type: "string",
      desc: "Optional -- gives the state of the string at this point in time; this should only be set some time after the patch at this point in time was made. Knowing this snap and all future patches determines all the future versions of the syncstring.",
    },
    seq_info: {
      type: "map",
      desc: "conat-assigned info about snapshot -- {seq:number; prev_seq?:number; index:number}",
    },
    sent: {
      type: "timestamp",
      desc: "Optional approximate time at which patch was **actually** sent to the server, which is approximately when it was really made available to other users.  In case of offline editing, patches from days ago might get inserted into the stream, and this makes it possible for the client to know and behave accordingly.  If this is not set then patch was sent about the same time it was created.",
    },
    prev: {
      type: "timestamp",
      desc: "Optional field to indicate patch dependence; if given, don't apply this patch until the patch with timestamp prev has been applied.",
    },
    format: {
      type: "integer",
      desc: "The format of the patch; NULL = compressed dmp patch (for strings); 1 = db-doc patches on objects.",
    },
    parents: {
      type: "array",
      pg_type: "INTEGER[]",
      desc: "The parent timestamps as ms since epoch",
    },
    version: {
      type: "integer",
      desc: "Version number of this patch.  Not necessarily globally unique across branches.  Used only to provide users a convenient way to refer to a particular version.",
    },
  },
  rules: {
    primary_key: ["string_id", "time", "is_snapshot"], // compound primary key
    default_primary_key_value: { is_snapshot: false },
    unique_writes: true, // there is no reason for a user to write exactly the same record twice
    pg_indexes: ["time"],
    user_query: {
      get: {
        fields: {
          string_id: null,
          time: null,
          wall: null,
          patch: null,
          user_id: null,
          snapshot: null,
          is_snapshot: null,
          seq_info: null,
          sent: null,
          prev: null,
          version: null,
          format: null,
          parents: null,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          // this verifies that user has read access to these patches
          return db._user_get_query_patches_check(
            obj,
            account_id,
            project_id,
            cb,
          );
        },
      },
      set: {
        fields: {
          string_id: true,
          time: true,
          wall: true,
          patch: true,
          user_id: true,
          snapshot: true,
          is_snapshot: true,
          seq_info: true,
          sent: true,
          prev: true,
          version: true,
          parents: true,
          format: true,
        },
        required_fields: {
          string_id: true,
          time: true,
          user_id: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          // this verifies that user has write access to these patches
          return db._user_set_query_patches_check(
            obj,
            account_id,
            project_id,
            cb,
          );
        },
        before_change(_db, old_val, new_val, _account_id, cb) {
          if (old_val != null) {
            // TODO/CRITICAL: not allowing this seems to cause a lot of problems
            //if old_val.sent and new_val.sent and new_val.sent - 0 != old_val.sent - 0   # CRITICAL: comparing dates here!
            //    cb("you may not change the sent time once it is set")
            //    return
            if (
              old_val.user_id != null &&
              new_val.user_id != null &&
              old_val.user_id !== new_val.user_id
            ) {
              cb(
                `you may not change the author of a patch from ${old_val.user_id} to ${new_val.user_id}`,
              );
              return;
            }
            if (
              old_val.patch != null &&
              new_val.patch != null &&
              old_val.patch !== new_val.patch
            ) {
              // comparison is ok since it is of *strings*
              cb("you may not change a patch");
              return;
            }
          }
          cb();
        },
      },
    },
  },
});

schema.patches.project_query = schema.patches.user_query;

Table({
  name: "crm_patches",
  rules: {
    virtual: "patches",
    primary_key: "string_id",
    user_query: {
      get: {
        pg_where: [],
        admin: true, // only admins can do get queries on this table
        fields: {
          ...schema.patches.user_query?.get?.fields,
          string_id: null,
        },
        options: [{ limit: 200 }, { order_by: "-time" }],
      },
    },
  },
  fields: schema.patches.fields,
});

/*
TODO: re-implement
* Table to be used for deleting the patches associated to a syncstring.
* Currently only allowed by admin.
schema.patches_delete  =
    primary_key : schema.patches.primary_key
    virtual     : 'patches'
    fields      : schema.patches.fields
    user_query:
        get :  # use get query since selecting a range of records for deletion
            pg_where : (obj, db) ->
                where = ["string_id = $::CHAR(40)" : obj.id[0]]
                if obj.id[1]?
                    where.push("time >= $::TIMESTAMP" : obj.id[1])
                return where
            admin  : true
            delete : true
            fields :
                id   : 'null'
                dummy : null
            check_hook : (db, obj, account_id, project_id, cb) ->
                * this verifies that user has read access to these patches -- redundant with admin requirement above.
                db._user_get_query_patches_check(obj, account_id, project_id, cb)
*/

Table({
  name: "cursors",
  fields: {
    string_id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "id of the syncstring that this patch belongs to.",
    },
    user_id: {
      type: "integer",
      desc: "id index of the user into the syncstrings users array",
      pg_check: "CHECK (user_id >= 0)",
    },
    locs: {
      type: "array",
      pg_type: "JSONB[]",
      desc: "[{x:?,y:?}, ...]    <-- locations of user_id's cursor(s)",
      pg_check: "NOT NULL",
    },
    time: {
      type: "timestamp",
      desc: "time when these cursor positions were sent out",
    },
  },
  rules: {
    primary_key: ["string_id", "user_id"], // this is a compound primary key as an array -- [string_id, user_id]
    durability: "soft", // loss of data for the cursors table just doesn't matter
    user_query: {
      get: {
        fields: {
          string_id: null,
          user_id: null,
          locs: null,
          time: null,
        },
        required_fields: {
          string_id: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          // this verifies that user has read access to these cursors
          return db._user_get_query_cursors_check(
            obj,
            account_id,
            project_id,
            cb,
          );
        },
      },
      set: {
        fields: {
          string_id: null,
          user_id: null,
          locs: true,
          time: true,
        },
        required_fields: {
          string_id: true,
          user_id: true,
          locs: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          // this verifies that user has write access to these cursors
          return db._user_set_query_cursors_check(
            obj,
            account_id,
            project_id,
            cb,
          );
        },
      },
    },
  },
});

schema.cursors.project_query = deep_copy(schema.cursors.user_query);

Table({
  name: "eval_inputs",
  fields: {
    string_id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "id of the syncdoc that this eval_inputs table is attached to",
    },
    time: {
      type: "timestamp",
      desc: "the timestamp of the input",
    },
    user_id: {
      type: "integer",
      desc: "id index of the user into the syncdoc users array",
      pg_check: "CHECK (user_id >= 0)",
    },
    input: {
      type: "map",
      desc: "For example it could be {program:'sage' or 'sh', input:{code:'...', data:'...', preparse:?, event:'execute_code', output_uuid:?, id:....}}",
    },
  },
  rules: {
    primary_key: ["string_id", "time", "user_id"],
    durability: "soft", // loss of eval requests not serious
    unique_writes: true,
    pg_indexes: ["time"],

    user_query: {
      get: {
        fields: {
          string_id: null,
          time: null,
          user_id: null,
          input: null,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
      set: {
        fields: {
          string_id: true,
          time: true,
          user_id: true,
          input: true,
        },
        required_fields: {
          string_id: true,
          time: true,
          user_id: true,
          input: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
    },
  },
});

schema.eval_inputs.project_query = schema.eval_inputs.user_query;

Table({
  name: "eval_outputs",
  fields: {
    string_id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "id of the syncstring that this patch belongs to.",
    },
    time: {
      type: "timestamp",
      desc: "the timestamp of the output",
    },
    number: {
      type: "integer",
      desc: "output_number starting at 0",
      pg_check: "CHECK (number >= 0)",
    },
    output: {
      type: "map",
    },
  },
  rules: {
    primary_key: ["string_id", "time", "number"],
    durability: "soft", // loss of eval output not serious (in long term only used for analytics)
    pg_indexes: ["time"],

    user_query: {
      get: {
        fields: {
          string_id: null,
          time: null,
          number: null,
          output: null,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
      set: {
        fields: {
          string_id: true,
          time: true,
          number: true,
          output: true,
        },
        required_fields: {
          string_id: true,
          time: true,
          number: true,
          output: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
    },
  },
});

schema.eval_outputs.project_query = schema.eval_outputs.user_query;

Table({
  name: "ipywidgets",
  fields: {
    string_id: {
      type: "string",
      desc: "id of the syncdoc that this widget is associated to (the Jupyter notebook).",
    },
    model_id: {
      type: "string",
      desc: "the id of the comm that this is data about",
    },
    type: {
      type: "string",
      desc: "type of info associated to this entry in the table:  'value' | 'state' | 'buffers' | 'message'",
    },
    data: {
      type: "map",
      desc: "actual info of the given type about the widget",
    },
  },
  rules: {
    primary_key: ["string_id", "model_id", "type"],
    durability: "soft", // only used as ephemeral table in project. This will
    // not be stored in the database ever.  Even if we want to persist widget
    // info, we would persist it as metadata in the ipynb file (say), and
    // definitely not in our database.

    user_query: {
      get: {
        fields: {
          string_id: null,
          model_id: null,
          type: null,
          data: null,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
      set: {
        delete: true,
        fields: {
          string_id: true,
          model_id: true,
          type: true,
          data: true,
        },
        required_fields: {
          string_id: true,
          model_id: true,
          type: true,
          data: true,
        },
        check_hook(db, obj, account_id, project_id, cb) {
          return db._syncstring_access_check(
            obj.string_id,
            account_id,
            project_id,
            cb,
          );
        },
      },
    },
  },
});

schema.ipywidgets.project_query = schema.ipywidgets.user_query;
