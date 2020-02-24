import { create } from "./types";

export const blobs = create({
  fields: {
    id: {
      type: "uuid",
      desc:
        "The uuid of this blob, which is a uuid derived from the Sha1 hash of the blob content."
    },
    blob: {
      type: "Buffer",
      desc: "The actual blob content"
    },
    expire: {
      type: "timestamp",
      desc:
        "When to expire this blob (when delete_expired is called on the database)."
    },
    created: {
      type: "timestamp",
      desc: "When the blob was created."
    },
    project_id: {
      type: "string",
      desc: "The uuid of the project that created the blob."
    },
    last_active: {
      type: "timestamp",
      desc: "When the blob was last pulled from the database."
    },
    count: {
      type: "integer",
      desc: "How many times the blob has been pulled from the database."
    },
    size: {
      type: "integer",
      desc: "The size in bytes of the blob."
    },
    gcloud: {
      type: "string",
      desc: "name of a bucket that contains the actual blob, if available."
    },
    backup: {
      type: "boolean",
      desc: "if true, then this blob was saved to an offsite backup"
    },
    compress: {
      type: "string",
      desc: "optional compression used: 'gzip', 'zlib', 'snappy'"
    }
  },
  rules: {
    desc:
      "Table that stores blobs mainly generated as output of Sage worksheets.",
    primary_key: "id",
    user_query: {
      get: {
        async instead_of_query(database, opts, cb): Promise<void> {
          const obj: any = Object.assign({}, opts.query);
          if (obj == null || obj.id == null) {
            cb("id must be specified");
            return;
          }
          database.get_blob({
            uuid: obj.id,
            cb(err, blob) {
              if (err) {
                cb(err);
              } else {
                cb(undefined, { id: obj.id, blob });
              }
            }
          });
        },
        fields: {
          id: null,
          blob: null
        }
      },
      set: {
        // NOTE: we put "as any" for fields below because ttl is not an actual field but
        // it is allowed for set queries and determine the expire field.  I would rather
        // do this (which *is* supported by the backend) then not restrict the fields keys
        // for other schema entries.  Alternatively, we could have a special kind of field
        // above that is "virtual", but that requires writing more code in the backend. We'll
        // do that if necessary.
        fields: {
          id: true,
          blob: true,
          project_id: "project_write",
          ttl: 0
        } as any,
        required_fields: {
          id: true,
          blob: true,
          project_id: true
        },
        async instead_of_change(
          database,
          _old_value,
          new_val,
          _account_id,
          cb
        ): Promise<void> {
          database.save_blob({
            uuid: new_val.id,
            blob: new_val.blob,
            ttl: new_val.ttl,
            project_id: new_val.project_id,
            check: true, // can't trust the user!
            cb
          });
        }
      }
    }
  }
});
