//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
The schema below determines the PostgreSQL database schema.   The notation is as follows:

schema.table_name =
    desc: 'A description of this table.'   # will be used only for tooling
    primary_key : 'the_table_primary_key'
    durability :  'hard' or 'soft' # optional -- if given, specify the table durability; 'hard' is the default
    fields :   # every field *must* be listed here or user queries won't work.
        the_table_primary_key :
            type : 'uuid'
            desc : 'This is the primary key of the table.'
        ...
    pg_indexes : [array of column names]  # also some more complicated ways to define indexes; see the examples.
    user_query :  # queries that are directly exposed to the client via a friendly "fill in what result looks like" query language
        get :     # describes get query for reading data from this table
            pg_where :  # this gets run first on the table before
                      'account_id' - replaced by user's account_id
                      'project_id' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be a project that user has read access to)
                      'project_id-public' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be of a project with at east one public path)
                      'all_projects_read' - filled in with list of all the id's of projects this user has read access to
                      'collaborators' - filled in by account_id's of all collaborators of this user
                      an arbitrary function -  gets called with an object with these keys:
                             account_id, table, query, multi, options, changes
            fields :  # these are the fields any user is allowed to see, subject to the all constraint above
                field_name    : either null or a default_value
                another_field : 10   # means will default to 10 if undefined in database
                this_field    : null # no default filled in
                settings :
                     strip : false   # defaults for a field that is an object -- these get filled in if missing in db
                     wrap  : true
        set :     # describes more dangerous *set* queries that the user can make via the query language
            pg_where :   # initially restrict what user can set
                'account_id' - user account_id
                      - list of project_id's that the user has write access to
            fields :    # user must always give the primary key in set queries
                account_id : 'account_id'  # means that this field will automatically be filled in with account_id
                project_id : 'project_write' # means that this field *must* be a project_id that the user has *write* access to
                foo : true   # user is allowed (but not required) to set this
                bar : true   # means user is allowed to set this

To specify more than one user query against a table, make a new table as above, omitting
everything except the user_query section, and include a virtual section listing the actual
table to query:

    virtual : 'original_table'

For example,

schema.collaborators =
    primary_key : 'account_id'
    anonymous   : false
    virtual     : 'accounts'
    user_query:
        get : ...


Finally, putting

    anonymous : true

makes it so non-signed-in-users may query the table (read only) for data, e.g.,

schema.stats =
    primary_key: 'id'
    anonymous : true   # allow user access, even if not signed in
    fields:
        id                  : true
        ...

*/
export const schema: any = {};


/*
Requests and status related to copying files between projects.
*/
schema.copy_paths = {
  primary_key: "id",
  fields: {
    id: {
      type: "uuid",
      desc: "random unique id assigned to this copy request"
    },
    time: {
      type: "timestamp",
      desc: "when this request was made"
    },
    source_project_id: {
      type: "uuid",
      desc: "the project_id of the source project"
    },
    source_path: {
      type: "string",
      desc: "the path of the source file or directory"
    },
    target_project_id: {
      type: "uuid",
      desc: "the project_id of the target project"
    },
    target_path: {
      type: "string",
      desc: "the path of the target file or directory"
    },
    overwrite_newer: {
      type: "boolean",
      desc: "if new, overwrite newer files in destination"
    },
    delete_missing: {
      type: "boolean",
      desc: "if true, delete files in the target that aren't in the source path"
    },
    backup: {
      type: "boolean",
      desc: "if true, make backup of files before overwriting"
    },
    public: {
      type: "boolean",
      desc:
        "if true, use files from the public share server instead of starting up the project"
    },
    bwlimit: {
      type: "string",
      desc:
        "optional limit on the bandwidth dedicated to this copy (passed to rsync)"
    },
    timeout: {
      type: "number",
      desc:
        "fail if the transfer itself takes longer than this number of seconds (passed to rsync)"
    },
    scheduled: {
      type: "timestamp",
      desc:
        "earliest time in the future, when the copy request should start (or null, for immediate execution)"
    },
    started: {
      type: "timestamp",
      desc: "when the copy request actually started running"
    },
    finished: {
      type: "timestamp",
      desc: "when the copy request finished"
    },
    error: {
      type: "string",
      desc: "if the copy failed or output any errors, they are put here."
    }
  },
  pg_indexes: [
    "time",
    "scheduled",
    "((started IS NULL))",
    "((finished IS NULL))"
  ]
};
// TODO: for now there are no user queries -- this is used entirely by backend servers,
// actually only in kucalc; later that may change, so the user can make copy
// requests this way, check on their status, show all current copies they are
// causing in a page (that is persistent over browser refreshes, etc.).
// That's for later.

schema.remember_me = {
  primary_key: "hash",
  durability: "soft", // dropping this would just require a user to login again
  fields: {
    hash: {
      type: "string",
      pg_type: "CHAR(127)"
    },
    value: {
      type: "map"
    },
    account_id: {
      type: "uuid"
    },
    expire: {
      type: "timestamp"
    }
  },
  pg_indexes: ["account_id"]
};

schema.auth_tokens = {
  primary_key: "auth_token",
  fields: {
    auth_token: {
      type: "string",
      pg_type: "CHAR(24)"
    },
    account_id: {
      type: "uuid"
    },
    expire: {
      type: "timestamp"
    }
  }
};

schema.stats = {
  primary_key: "id",
  durability: "soft", // ephemeral stats whose slight loss wouldn't matter much
  anonymous: false, // if true, this would allow user read access, even if not signed in -- we used to do this but decided to use polling instead, since update interval is predictable.
  fields: {
    id: {
      type: "uuid"
    },
    time: {
      type: "timestamp",
      pg_check: "NOT NULL"
    },
    accounts: {
      type: "integer",
      pg_check: "NOT NULL CHECK (accounts >= 0)"
    },
    accounts_created: {
      type: "map"
    },
    files_opened: {
      type: "map"
    },
    projects: {
      type: "integer",
      pg_check: "NOT NULL CHECK (projects >= 0)"
    },
    projects_created: {
      type: "map"
    },
    projects_edited: {
      type: "map"
    },
    hub_servers: {
      type: "array",
      pg_type: "JSONB[]"
    }
  },
  pg_indexes: ["time"]
};

schema.storage_servers = {
  primary_key: "host",
  fields: {
    host: {
      type: "string",
      desc: "hostname of the storage server",
      pg_type: "VARCHAR(63)"
    }
  }
};

schema.system_notifications = {
  primary_key: "id",
  db_standby: "unsafe",
  anonymous: true, // allow users read access, even if not signed in
  fields: {
    id: {
      type: "uuid",
      desc: "primary key"
    },
    time: {
      type: "timestamp",
      desc: "time of this message"
    },
    text: {
      type: "string",
      desc: "the text of the message"
    },
    priority: {
      type: "string",
      pg_type: "VARCHAR(6)",
      desc: 'one of "low", "medium", or "high"'
    },
    done: {
      type: "boolean",
      desc: "if true, then this notification is no longer relevant"
    }
  },
  user_query: {
    get: {
      pg_where: ["time >= NOW() - INTERVAL '1 hour'"],
      pg_changefeed: "one-hour",
      throttle_changes: 3000,
      fields: {
        id: null,
        time: null,
        text: "",
        priority: "low",
        done: false
      }
    },
    set: {
      admin: true,
      fields: {
        id: true,
        time: true,
        text: true,
        priority: true,
        done: true
      }
    }
  }
};

schema.mentions = {
  primary_key: ["time", "project_id", "path", "target"],
  db_standby: "unsafe",
  fields: {
    time: {
      type: "timestamp",
      desc: "when this mention happened."
    },
    project_id: {
      type: "uuid"
    },
    path: {
      type: "string"
    },
    source: {
      type: "uuid",
      desc: "User who did the mentioning."
    },
    target: {
      type: "string",
      desc:
        "uuid of user who was mentioned; later will have other possibilities including group names, 'all', etc."
    },
    description: {
      type: "string",
      desc:
        "Extra text to describe the mention. eg. could be the containing message"
    },
    priority: {
      type: "number",
      desc:
        "optional integer priority.  0 = default, but could be 1 = higher priority, etc."
    },
    error: {
      type: "string",
      desc: "some sort of error occured handling this mention"
    },
    action: {
      type: "string",
      desc: "what action was attempted by the backend - 'email', 'ignore'"
    },
    users: {
      type: "map",
      desc: "{account_id1: {read: boolean, saved: boolean}, account_id2: {...}}"
    }
  },

  pg_indexes: ["action"],

  user_query: {
    get: {
      pg_where: ["time >= NOW() - interval '14 days'", "projects"],
      pg_changefeed: "projects",
      options: [{ order_by: "-time" }, { limit: 100 }], // limit is arbitrary
      throttle_changes: 3000,
      fields: {
        time: null,
        project_id: null,
        path: null,
        source: null,
        target: null,
        priority: null,
        description: null,
        users: null
      }
    },
    set: {
      fields: {
        time({ time }) {
          return time || new Date();
        },
        project_id: "project_write",
        path: true,
        source: true,
        target: true,
        priority: true,
        description: true,
        users: true
      },
      required_fields: {
        project_id: true,
        source: true,
        path: true,
        target: true
      }
    }
  }
};

// Tracking web-analytics
// this records data about users hitting cocalc and cocalc-related websites
// this table is 100% back-end only
schema.analytics = {
  primary_key: ["token"],
  pg_indexes: ["token", "data_time"],
  durability: "soft",
  fields: {
    token: {
      type: "uuid"
    },
    data: {
      type: "map",
      desc: "referrer, landing page, utm, etc."
    },
    data_time: {
      type: "timestamp",
      desc: "when the data field was set"
    },
    account_id: {
      type: "uuid",
      desc: "set only once, when the user (eventually) signs in"
    },
    account_id_time: {
      type: "timestamp",
      desc: "when the account id was set"
    }
  }
};

// what software environments there are available
schema.compute_images = {
  primary_key: ["id"],
  anonymous: true,
  fields: {
    id: {
      type: "string",
      desc: "docker image 'name:tag', where tag defaults to 'latest'"
    },
    src: {
      type: "string",
      desc: "source of the image (likely https://github [...] .git)"
    },
    type: {
      type: "string",
      desc: "for now, this is either 'legacy' or 'custom'"
    },
    display: {
      type: "string",
      desc: "(optional) user-visible name (defaults to id)"
    },
    url: {
      type: "string",
      desc: "(optional) where the user can learn more about it"
    },
    desc: {
      type: "string",
      desc: "(optional) markdown text to talk more about this"
    },
    path: {
      type: "string",
      desc:
        "(optional) point user to either a filename like index.ipynb or a directory/"
    },
    disabled: {
      type: "boolean",
      desc: "(optional) if set and true, do not offer as a selection"
    }
  },
  user_query: {
    get: {
      throttle_changes: 30000,
      pg_where: [],
      fields: {
        id: null,
        src: null,
        type: null,
        display: null,
        url: null,
        desc: null,
        path: null,
        disabled: null
      }
    }
  }
};

// Table for tracking events related to a particular
// account which help us optimize for growth.
// Example entry;
//  account_id: 'some uuid'
//  time: a timestamp
//  key: 'sign_up_how_find_cocalc'
//  value: 'via a google search'
//
// Or if user got to cocalc via a chat mention link:
//
//  account_id: 'some uuid'
//  time: a timestamp
//  key: 'mention'
//  value: 'url of a chat file'
//
// The user cannot read or write directly to this table.
// Writes are done via an API call, which (in theory can)
// enforces some limit (to avoid abuse) at some point...
schema.user_tracking = {
  primary_key: ["account_id", "time"],
  pg_indexes: ["event", "time"],
  durability: "soft",
  fields: {
    account_id: {
      type: "uuid",
      desc: "id of the user's account"
    },
    time: {
      type: "timestamp",
      desc: "time of this message"
    },
    event: {
      type: "string",
      desc: "event we are tracking",
      pg_check: "NOT NULL"
    },
    value: {
      type: "map",
      desc: "optional further info about the event (as a map)"
    }
  }
};
