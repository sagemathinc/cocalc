/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { deep_copy } from "../misc";
import { SCHEMA as schema } from "./index";
import { Table } from "./types";
import { checkPublicPathName } from "./name-rules";

export interface PublicPath {
  id: string;
  project_id: string;
  path: string;
  name?: string;
  description?: string;
  disabled?: boolean;
  unlisted?: boolean;
  authenticated?: boolean; // if true, only authenticated users are allowed to access
  created?: Date;
  license?: string;
  last_edited?: Date;
  last_saved?: Date;
  counter?: number;
  vhost?: string;
  auth?: string;
  compute_image?: string;
  redirect?: string;
}

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
          name: true,
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
    name: {
      type: "string",
      pg_type: "VARCHAR(100)",
      desc: "The optional name of this public path.  Must be globally unique (up to case) across all public paths in a given project.  It can be between 1 and 100 characters from a-z A-Z 0-9 period and dash.",
      render: {
        type: "text",
        editable: true,
      },
    },
    description: {
      type: "string",
      render: {
        type: "markdown",
        maxLen: 1024,
        editable: true,
      },
    },
    disabled: {
      type: "boolean",
      desc: "if true then disabled",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    unlisted: {
      type: "boolean",
      desc: "if true then unlisted, so does not appear in /share listing page.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    authenticated: {
      type: "boolean",
      desc: "if true, then only authenticated users have access",
      render: {
        type: "boolean",
        editable: true,
      },
    },
    license: {
      type: "string",
      desc: "The license that the content of the share is made available under.",
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
      desc: "when this path was last saved (or deleted if disabled) by manage-storage",
    },
    counter: {
      type: "number",
      desc: "the number of times this public path has been accessed",
      render: { type: "number", editable: true, integer: true, min: 0 },
    },
    vhost: {
      // For now, this will only be used *manually* for now; at some point users will be able to specify this,
      // though maybe they have to prove they own it.  This will be like "github pages", basically.
      // For now we will only serve the vhost files statically with no special support, except we do support
      // basic http auth.   However, we will add
      // special server support for certain file types (e.g., math typesetting, markdown, sagews, ipynb, etc.)
      // so static websites can just be written in a mix of md, html, ipynb, etc. files with no javascript needed.
      // This could be a non-default option.
      // IMPORTANT: right now if vhost is set, then the share is not visible at all to the normal share server.
      // This is intentional for security reasons, since vhosts actually serve html files in a way that can be
      // directly viewed in the browser, and they could contain dangerous content, so must be served on a different
      // domain to avoid them somehow being an attack vector.
      // BUG: I also can't get this to work for new domains; it only works for foo.cocalc.com for subdomains, and my
      // old domains like vertramp.org.  WEIRD.
      type: "string",
      desc: 'Request for the given host (which must not contain the string "cocalc") will be served by this public share. Only one public path can have a given vhost.  The vhost field can be a comma-separated string for multiple vhosts that point to the same public path.',
      unique: true,
      render: {
        type: "text",
        editable: true,
      },
    },
    cross_origin_isolation: {
      // This is used by https://python-wasm.cocalc.com.  But it can't be used by https://sagelets.cocalc.com/
      // since that loads third party javascript from the sage cell server.   The only safe and secure way to
      // allow this functionality is in a minimal page that doesn't load content from other pages, and that's
      // just the way it is.  You can't embed such a minimal page in an iframe.   See
      //    https://stackoverflow.com/questions/69322834/is-it-possible-to-embed-a-cross-origin-isolated-iframe-inside-a-normal-page
      // for a discussion.
      type: "boolean",
      desc: "Set to true to enable cross-origin isolation for this shared path.  It will be served with COOP and COEP headers set to enable access to web APIs including SharedArrayBuffer and Atomics and prevent outer attacks (Spectre attacks, cross-origin attacks, etc.).  Setting this will break loading any third party javascript that requires communication with cross-origin windows, e.g., the Sage Cell Server.",
    },
    auth: {
      type: "map",
      desc: "Map from relative path inside the share to array of {path:[{name:[string], pass:[password-hash]}, ...], ...}.  Used both by vhost and share server, but not user editable yet.  Later it will be user editable.  The password hash is from packages/hub/auth.password_hash (so 1000 iterations of sha512)",
    },
    token: {
      type: "string",
      desc: "Random token that must be passed in as query parameter to see this share; this increases security.  Only used for unlisted shares.",
      render: {
        type: "text",
        editable: true,
      },
    },
    compute_image: {
      type: "string",
      desc: "The underlying compute image, which defines the associated software stack. e.g. 'default', 'custom/some-id/latest', ...",
    },
    url: {
      type: "string",
      desc: "If given, use this relative URL to open this share. ONLY set this for proxy urls!  For example: 'gist/darribas/4121857' or 'github/cocalc/sagemathinc' or 'url/wstein.org/Tables/modjac/curves.txt'.  The point is that we need to store the url somewhere, and don't want to end up using the ugly id in this case.  This is different than the urls that come from setting a name for the owner and public path, since that's for files shared *from* within cocalc.",
    },
    image: {
      type: "string",
      desc: "Image that illustrates this shared content.",
      render: { type: "image" },
    },
    redirect: {
      type: "string",
      desc: "Redirect path for this share",
      render: {
        type: "text",
        editable: true,
      },
    },

  },
  rules: {
    primary_key: "id",
    db_standby: "unsafe",
    anonymous: true, // allow user *read* access, even if not signed in

    pg_indexes: [
      "project_id",
      "url",
      "last_edited",
      "vhost",
      "disabled",
      "unlisted",
      "authenticated",
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
          name: null,
          url: null, // user can get this but NOT set it (below) since it's set when path is created only (it defines the path).
          description: null,
          image: null,
          disabled: null, // if true then disabled
          unlisted: null, // if true then do not show in main listing (so doesn't get google indexed)
          authenticated: null, // if true, only authenticated users can have access
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
          // don't use DEFAULT_COMPUTE_IMAGE, because old shares without that val set will always be "default"!
          compute_image: "default",
          cross_origin_isolation: null,
          redirect: null,
        },
      },
      set: {
        fields: {
          id(obj, db) {
            return db.sha1(obj.project_id, obj.path);
          },
          project_id: "project_write",
          path: true,
          name: true,
          description: true,
          image: true,
          disabled: true,
          unlisted: true,
          authenticated: true,
          license: true,
          last_edited: true,
          created: true,
          compute_image: true,
          cross_origin_isolation: true,
          redirect: true,
        },
        required_fields: {
          id: true,
          project_id: true,
          path: true,
        },
        check_hook(db, obj, _account_id, _project_id, cb) {
          if (!obj["name"]) {
            cb();
            return;
          }
          // confirm that the name is valid:
          try {
            checkPublicPathName(obj["name"]);
          } catch (err) {
            cb(err.toString());
            return;
          }
          // It's a valid name, so next check that it is not already in use in this project
          db._query({
            query: "SELECT path FROM public_paths",
            where: {
              "project_id = $::UUID": obj["project_id"],
              "path != $::TEXT": obj["path"],
              "LOWER(name) = $::TEXT": obj["name"].toLowerCase(),
            },
            cb: (err, result) => {
              if (err) {
                cb(err);
                return;
              }
              if (result.rows.length > 0) {
                cb(
                  `There is already a public path "${result.rows[0].path}" in this project with the name "${obj["name"]}".  Names are not case sensitive.`,
                );
                return;
              }
              // success
              cb();
            },
          });
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
          name: null,
          description: null,
          disabled: null, // if true then disabled
          unlisted: null, // if true then do not show in main listing (so doesn't get google indexed)
          authenticated: null, // if true, only authenticated users can have access
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
          compute_image: null,
          redirect: null,
        },
      },
    },
  },
});

// WARNING: the fields in queries to all_publics_paths are ignored; all of them are always returned.
Table({
  name: "all_public_paths",
  rules: {
    virtual: "public_paths",
    user_query: {
      get: {
        async instead_of_query(database, opts, cb): Promise<void> {
          try {
            cb(undefined, await database.get_all_public_paths(opts.account_id));
          } catch (err) {
            cb(err);
          }
        },
        fields: {
          id: null,
          project_id: null,
          path: null,
          name: null,
          description: null,
          disabled: null, // if true then disabled
          unlisted: null, // if true then do not show in main listing (so doesn't get google indexed)
          authenticated: null, // if true, only authenticated users can have access
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
          compute_image: null,
        },
      },
    },
  },
});

Table({
  name: "crm_public_paths",
  fields: schema.public_paths.fields,
  rules: {
    primary_key: schema.public_paths.primary_key,
    virtual: "public_paths",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        // (without this, users who have read access could read)
        pg_where: [],
        options: [{ limit: 300, order_by: "-last_edited" }],
        // @ts-ignore
        fields: schema.public_paths.user_query.get.fields,
      },
      set: {
        admin: true,
        fields: {
          id: true,
          name: true,
          description: true,
          counter: true,
          image: true,
          disabled: true,
          unlisted: true,
          authenticated: true,
          license: true,
          last_edited: true,
          created: true,
          compute_image: true,
          redirect: true,
        },
        // not doing this since don't want to require project_id and path to
        // be set, and this is for admin use only anyways:
        // check_hook: schema.public_paths.user_query.set.check_hook,
      },
    },
  },
});
