/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

// Note that github has a 10MB limit --
//   https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files
// All code in cocalc (frontend, etc.) should use this,
// rather than copying or defining their own!
export const MAX_BLOB_SIZE = 25_000_000;

// some throttling -- note that after a bit, most blobs end up longterm
// cloud storage and are never accessed.  This is mainly a limit to
// prevent abuse.
export const MAX_BLOB_SIZE_PER_PROJECT_PER_DAY = {
  licensed: 100 * MAX_BLOB_SIZE,
  unlicensed: 10 * MAX_BLOB_SIZE,
};

Table({
  name: "blobs",
  fields: {
    id: {
      type: "uuid",
      desc: "The uuid of this blob, which is a uuid derived from the Sha1 hash of the blob content.",
    },
    blob: {
      type: "Buffer",
      desc: "The actual blob content",
    },
    expire: {
      type: "timestamp",
      desc: "When to expire this blob (when delete_expired is called on the database).",
    },
    created: {
      type: "timestamp",
      desc: "When the blob was created.",
    },
    project_id: {
      // I'm not really sure why we record a project associated to the blob, rather
      // than something else (e.g., account_id)-- update: added that.  However, it's useful for abuse, since
      // if abuse happened with a project, we could easily delete all corresponding blobs,
      // and also it's a good tag for throttling.
      type: "string",
      desc: "The uuid of the project that created the blob, if it is associated to a project.",
    },
    account_id: {
      type: "uuid",
      desc: "The uuid of the account that created the blob. (Only started recording in late 2024.  Will make it so a user can optionally delete any blobs associated to their account when deleting their account.)",
    },
    last_active: {
      type: "timestamp",
      desc: "When the blob was last pulled from the database.",
    },
    count: {
      type: "number",
      desc: "How many times the blob has been pulled from the database.",
    },
    size: {
      type: "number",
      desc: "The size in bytes of the blob.",
    },
    gcloud: {
      type: "string",
      desc: "name of a bucket that contains the actual blob, if available.",
    },
    backup: {
      type: "boolean",
      desc: "if true, then this blob was saved to an offsite backup",
    },
    compress: {
      type: "string",
      desc: "optional compression used: 'gzip' or 'zlib'",
    },
  },
  rules: {
    desc: "Table that stores blobs mainly generated as output of Sage worksheets.",
    primary_key: "id",
    // these indices speed up the search been done in 'copy_all_blobs_to_gcloud'
    // less important to make this query fast, but we want to avoid thrashing cache
    pg_indexes: ["((expire IS NULL))", "((gcloud IS NULL))", "last_active"],
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
            },
          });
        },
        fields: {
          id: null,
          blob: null,
        },
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
          account_id: "account_id",
          ttl: 0,
        } as any,
        required_fields: {
          id: true,
          blob: true,
          project_id: true,
        },
        async instead_of_change(
          database,
          _old_value,
          new_val,
          account_id,
          cb,
        ): Promise<void> {
          database.save_blob({
            uuid: new_val.id,
            blob: new_val.blob,
            ttl: new_val.ttl,
            project_id: new_val.project_id,
            account_id,
            check: true, // can't trust the user!
            cb,
          });
        },
      },
    },
  },
});
