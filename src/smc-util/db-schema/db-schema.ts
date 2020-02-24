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
