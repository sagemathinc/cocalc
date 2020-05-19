/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { deep_copy } from "../misc";
import { SCHEMA as schema } from "./index";
import { Table } from "./types";

// Get publicly available information about a project.
Table({
  name: "public_projects",
  rules: {
    anonymous: true,
    virtual: "projects",
    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id-public" }],
        fields: {
          project_id: true,
          title: true,
          description: true,
        },
      },
    },
  },
});

Table({
  name: "public_paths",
  fields: {
    id: {
      type: "string",
      pg_type: "CHAR(40)",
      desc: "sha1 hash derived from project_id and path",
    },
    project_id: {
      type: "uuid",
    },
    path: {
      type: "string",
    },
    description: {
      type: "string",
    },
    disabled: {
      type: "boolean",
      desc: "if true then disabled",
    },
    unlisted: {
      type: "boolean",
      desc: "if true then unlisted, so does not appear in /share listing page.",
    },
    license: {
      type: "string",
      desc:
        "The license that the content of the share is made available under.",
    },
    created: {
      type: "timestamp",
      desc: "when this path was created",
    },
    last_edited: {
      type: "timestamp",
      desc: "when this path was last edited",
    },
    last_saved: {
      type: "timestamp",
      desc:
        "when this path was last saved (or deleted if disabled) by manage-storage",
    },
    counter: {
      type: "number",
      desc: "the number of times this public path has been accessed",
    },
    vhost: {
      // For now, this will only be used *manually* for now; at some point users will be able to specify this,
      // though maybe they have to prove they own it.
      // For now we will only serve the vhost files statically with no special support, except we do support
      // basic http auth.   However, we will add
      // special server support for certain file types (e.g., math typesetting, markdown, sagews, ipynb, etc.)
      // so static websites can just be written in a mix of md, html, ipynb, etc. files with no javascript needed.
      // This could be a non-default option.
      // IMPORTANT: right now if vhost is set, then the share is not visible at all to the normal share server.
      type: "string",
      desc:
        'Request for the given host (which must not container "cocalc") will be served by this public share. Only one public path can have a given vhost.  The vhost field can be a comma-separated string for multiple vhosts.',
      unique: true,
    },
    auth: {
      type: "map",
      desc:
        "Map from relative path inside the share to array of {path:[{name:[string], pass:[password-hash]}, ...], ...}.  Used both by vhost and share server, but not user editable yet.  Later it will be user editable.  The password hash is from smc-hub/auth.password_hash (so 1000 iterations of sha512)",
    },
    token: {
      type: "string",
      desc:
        "Random token that must be passed in as query parameter to see this share; this increases security.  Only used for unlisted shares.",
    },
  },
  rules: {
    primary_key: "id",
    db_standby: "unsafe",
    anonymous: true, // allow user *read* access, even if not signed in

    pg_indexes: [
      "project_id",
      "(substring(project_id::text from 1 for 1))",
      "(substring(project_id::text from 1 for 2))",
    ],

    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        throttle_changes: 2000,
        fields: {
          id: null,
          project_id: null,
          path: null,
          description: null,
          disabled: null, // if true then disabled
          unlisted: null, // if true then do not show in main listing (so doesn't get google indexed)
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
        },
      },
      set: {
        fields: {
          id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          project_id: "project_write",
          path: true,
          description: true,
          disabled: true,
          unlisted: true,
          license: true,
          last_edited: true,
          created: true,
        },
        required_fields: {
          id: true,
          project_id: true,
          path: true,
        },
      },
    },
  },
});

schema.public_paths.project_query = deep_copy(schema.public_paths.user_query);

/* Look up a single public path by its id. */

Table({
  name: "public_paths_by_id",
  rules: {
    anonymous: true,
    virtual: "public_paths",
    user_query: {
      get: {
        check_hook(_db, obj, _account_id, _project_id, cb): void {
          if (typeof obj.id == "string" && obj.id.length == 40) {
            cb(); // good
          } else {
            cb("id must be a sha1 hash");
          }
        },
        fields: {
          id: null,
          project_id: null,
          path: null,
          description: null,
          disabled: null, // if true then disabled
          unlisted: null, // if true then do not show in main listing (so doesn't get google indexed)
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
        },
      },
    },
  },
});
