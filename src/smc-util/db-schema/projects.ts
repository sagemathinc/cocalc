/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { deep_copy } from "../misc";
import { DEFAULT_QUOTAS } from "../upgrade-spec";
import { FALLBACK_COMPUTE_IMAGE } from "./defaults";
import { SCHEMA as schema } from "./index";
import { Table } from "./types";
import { State } from "../compute-states";

Table({
  name: "projects",
  rules: {
    primary_key: "project_id",
    //# A lot depends on this being right at all times, e.g., restart state,
    //# so do not use db_standby yet.
    //# It is simply not robust enough.
    //# db_standby : 'safer'

    pg_indexes: [
      "last_edited",
      "created", // TODO: this could have a fillfactor of 100
      "USING GIN (users)", // so get_collaborator_ids is fast
      "USING GIN (host jsonb_path_ops)", // so get_projects_on_compute_server is fast
      "lti_id",
      "USING GIN (state)", // so getting all running projects is fast (e.g. for site_license_usage_log... but also manage-state)
      "((state #>> '{state}'))", // projecting the "state" (running, etc.) for its own index – the GIN index above still causes a scan, which we want to avoid.
      "((state ->> 'state'))", // same reason as above. both syntaxes appear and we have to index both.
      "((state IS NULL))", // not coverd by the above
      "((settings ->> 'always_running'))", // to quickly know which projects have this setting
      "((run_quota ->> 'always_running'))", // same reason as above
    ],

    user_query: {
      get: {
        pg_where: ["last_edited >= NOW() - interval '21 days'", "projects"],
        pg_where_load: ["last_edited >= NOW() - interval '2 days'", "projects"],
        options: [{ limit: 100, order_by: "-last_edited" }],
        options_load: [{ limit: 15, order_by: "-last_edited" }],
        pg_changefeed: "projects",
        throttle_changes: 2000,
        fields: {
          project_id: null,
          title: "",
          description: "",
          users: {},
          invite: null, // who has been invited to this project via email
          invite_requests: null, // who has requested to be invited
          deleted: null,
          host: null,
          settings: DEFAULT_QUOTAS,
          site_license: null,
          status: null,
          state: null,
          last_edited: null,
          last_active: null,
          action_request: null, // last requested action -- {action:?, time:?, started:?, finished:?, err:?}
          course: null,
          // if the value is not set, we have to use the old default prior to summer 2020 (Ubuntu 18.04, not 20.04!)
          compute_image: FALLBACK_COMPUTE_IMAGE,
          created: null,
          env: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          title: true,
          description: true,
          deleted: true,
          invite_requests: true, // project collabs can modify this (e.g., to remove from it once user added or rejected)
          users(obj, db, account_id) {
            return db._user_set_query_project_users(obj, account_id);
          },
          action_request: true, // used to request that an action be performed, e.g., "save"; handled by before_change
          compute_image: true,
          course: true,
          site_license: true,
          env: true,
        },

        before_change(database, old_val, new_val, account_id, cb) {
          database._user_set_query_project_change_before(
            old_val,
            new_val,
            account_id,
            cb
          );
        },

        on_change(database, old_val, new_val, account_id, cb) {
          database._user_set_query_project_change_after(
            old_val,
            new_val,
            account_id,
            cb
          );
        },
      },
    },

    project_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        fields: {
          project_id: null,
          title: null,
          description: null,
          status: null,
        },
      },
      set: {
        fields: {
          project_id: "project_id",
          title: true,
          description: true,
          status: true,
        },
      },
    },
  },
  fields: {
    project_id: {
      type: "uuid",
      desc: "The project id, which is the primary key that determines the project.",
    },
    title: {
      type: "string",
      desc: "The short title of the project. Should use no special formatting, except hashtags.",
    },
    description: {
      type: "string",
      desc: "A longer textual description of the project.  This can include hashtags and should be formatted using markdown.",
    }, // markdown rendering possibly not implemented
    users: {
      type: "map",
      desc: "This is a map from account_id's to {hide:bool, group:['owner',...], upgrades:{memory:1000, ...}, ssh:{...}}.",
    },
    invite: {
      type: "map",
      desc: "Map from email addresses to {time:when invite sent, error:error message if there was one}",
      date: ["time"],
    },
    invite_requests: {
      type: "map",
      desc: "This is a map from account_id's to {timestamp:?, message:'i want to join because...'}.",
      date: ["timestamp"],
    },
    deleted: {
      type: "boolean",
      desc: "Whether or not this project is deleted.",
    },
    host: {
      type: "map",
      desc: "This is a map {host:'hostname_of_server', assigned:timestamp of when assigned to that server}.",
      date: ["assigned"],
    },
    settings: {
      type: "map",
      desc: 'This is a map that defines the free base quotas that a project has. It is of the form {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0, ephemeral_state:0, ephemeral_disk:0, always_running:0}.  WARNING: some of the values are strings not numbers in the database right now, e.g., disk_quota:"1000".',
    },
    site_license: {
      type: "map",
      desc: "This is a map that defines upgrades (just when running the project) that come from a site license, and also the licenses that are applied to this project.  The format is {licensed_id:{memory:?, mintime:?, ...}} where the target of the license_id is the same as for the settings field. The licensed_id is the uuid of the license that contributed these upgrades.  To tell cocalc to use a license for a project, a user sets site_license to {license_id:{}}, and when it is requested to start the project, the backend decides what allocation license_id provides and changes the field accordingly.",
    },
    status: {
      type: "map",
      desc: "This is a map computed by the status command run inside a project, and slightly enhanced by the compute server, which gives extensive status information about a project. See the exported ProjectStatus interface defined in the code here.",
    },
    state: {
      type: "map",
      desc: 'Info about the state of this project of the form  {error: "", state: "running" (etc), time: timestamp, ip?:"ip address where project is"}, where time is when the state was last computed.  See COMPUTE_STATES in the compute-states file for state.state and the ProjectState interface defined below in code.',
      date: ["time"],
    },
    last_edited: {
      type: "timestamp",
      desc: "The last time some file was edited in this project.  This is the last time that the file_use table was updated for this project.",
    },
    last_started: {
      type: "timestamp",
      desc: "The last time the project started running.",
    },
    last_active: {
      type: "map",
      desc: "Map from account_id's to the timestamp of when the user with that account_id touched this project.",
      date: "all",
    },
    created: {
      type: "timestamp",
      desc: "When the project was created.",
    },
    action_request: {
      type: "map",
      desc: "Request state change action for project: {action:['start', 'stop'], started:timestamp, err:?, finished:timestamp}",
      date: ["started", "finished"],
    },
    storage: {
      type: "map",
      desc: "(DEPRECATED) This is a map {host:'hostname_of_server', assigned:when first saved here, saved:when last saved here}.",
      date: ["assigned", "saved"],
    },
    last_backup: {
      type: "timestamp",
      desc: "(DEPRECATED) Timestamp of last off-disk successful backup using bup to Google cloud storage",
    },
    storage_request: {
      type: "map",
      desc: "(DEPRECATED) {action:['save', 'close', 'move', 'open'], requested:timestap, pid:?, target:?, started:timestamp, finished:timestamp, err:?}",
      date: ["started", "finished", "requested"],
    },
    course: {
      type: "map",
      desc: "{project_id:[id of project that contains .course file], path:[path to .course file], pay:?, email_address:[optional email address of student -- used if account_id not known], account_id:[account id of student]}, where pay is either not set (or equals falseish) or is a timestamp by which the students must move the project to a members only server.",
      date: ["pay"],
    },
    storage_server: {
      type: "integer",
      desc: "(DEPRECATED) Number of the Kubernetes storage server with the data for this project: one of 0, 1, 2, ...",
    },
    storage_ready: {
      type: "boolean",
      desc: "(DEPRECATED) Whether storage is ready to be used on the storage server.  Do NOT try to start project until true; this gets set by storage daemon when it notices that run is true.",
    },
    disk_size: {
      type: "integer",
      desc: "Size in megabytes of the project disk.",
    },
    resources: {
      type: "map",
      desc: 'Object of the form {requests:{memory:"30Mi",cpu:"5m"}, limits:{memory:"100Mi",cpu:"300m"}} which is passed to the k8s resources section for this pod.',
    },
    preemptible: {
      type: "boolean",
      desc: "If true, allow to run on preemptible nodes.",
    },
    idle_timeout: {
      type: "integer",
      desc: "If given and nonzero, project will be killed if it is idle for this many **minutes**, where idle *means* that last_edited has not been updated.",
    },
    run_quota: {
      type: "map",
      desc: "If project is running, this is the quota that it is running with.",
    },
    compute_image: {
      type: "string",
      desc: `Specify the name of the underlying (kucalc) compute image.`,
    },
    addons: {
      type: "map",
      desc: "Configure (kucalc specific) addons for projects. (e.g. academic software, license keys, ...)",
    },
    lti_id: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "This is a specific ID derived from an LTI context",
    },
    lti_data: {
      type: "map",
      desc: "extra information related to LTI",
    },
    env: {
      type: "map",
      desc: "Additional environment variables (TS: {[key:string]:string})",
    },
  },
});

// Same query above, but without the last_edited time constraint.
schema.projects_all = deep_copy(schema.projects);
if (
  schema.projects_all.user_query?.get == null ||
  schema.projects.user_query?.get == null
) {
  throw Error("make typescript happy");
}
schema.projects_all.user_query.get.options = [];
schema.projects_all.virtual = "projects";
schema.projects_all.user_query.get.pg_where = ["projects"];

// Table that provides extended read info about a single project
// but *ONLY* for admin.
Table({
  name: "projects_admin",
  fields: schema.projects.fields,
  rules: {
    primary_key: schema.projects.primary_key,
    virtual: "projects",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        // (without this, users who have read access could read)
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        fields: schema.projects.user_query.get.fields,
      },
    },
  },
});

/*
Table that enables set queries to the course field of a project.  Only
project owners are allowed to use this table.  The point is that this makes
it possible for the owner of the project to set things, but not for the
collaborators to set those things.
**wARNING:** right now we're not using this since when multiple people add
students to a course and the 'course' field doesn't get properly set,
much confusion and misery arises.... and it is very hard to fix.
In theory a malicous student could not pay via this.  But if they could
mess with their client, they could easily not pay anyways.
*/
Table({
  name: "projects_owner",
  rules: {
    virtual: "projects",
    user_query: {
      set: {
        fields: {
          project_id: "project_owner",
          course: true,
        },
      },
    },
  },
  fields: {
    project_id: true,
    course: true,
  },
});

/*

Table that enables any signed-in user to set an invite request.
Later: we can make an index so that users can see all outstanding requests they have made easily.
How to test this from the browser console:
   project_id = '4e0f5bfd-3f1b-4d7b-9dff-456dcf8725b8' // id of a project you have
   invite_requests = {}; invite_requests[smc.client.account_id] = {timestamp:new Date(), message:'please invite me'}
   smc.client.query({cb:console.log, query:{project_invite_requests:{project_id:project_id, invite_requests:invite_requests}}})  // set it
   smc.redux.getStore('projects').get_project(project_id).invite_requests                 // see requests for this project

CURRENTLY NOT USED, but probably will be...

database._user_set_query_project_invite_requests(old_val, new_val, account_id, cb)
 For now don't check anything -- this is how we will make it secure later.
 This will:
   - that user setting this is signed in
   - ensure user only modifies their own entry (for their own id).
   - enforce some hard limit on number of outstanding invites (say 30).
   - enforce limit on size of invite message.
   - sanity check on timestamp
   - with an index as mentioned above we could limit the number of projects
     to which a single user has requested to be invited.

*/
Table({
  name: "project_invite_requests",
  rules: {
    virtual: "projects",
    primary_key: "project_id",
    user_query: {
      set: {
        fields: {
          project_id: true,
          invite_requests: true,
        },
        before_change(_database, _old_val, _new_val, _account_id, cb) {
          cb();
        },
      },
    },
  }, // actual function will be database._user...
  fields: {
    project_id: true,
    invite_requests: true,
  }, // {account_id:{timestamp:?, message:?}, ...}
});

/*
Table to get/set the datastore config in addons.

The main idea is to set/update/delete entries in the dict addons.datastore.[key] = {...}
*/
Table({
  name: "project_datastore",
  rules: {
    virtual: "projects",
    primary_key: "project_id",
    user_query: {
      set: {
        // this also deals with delete requests
        fields: {
          project_id: true,
          addons: true,
        },
        async instead_of_change(
          db,
          _old_value,
          new_val,
          account_id,
          cb
        ): Promise<void> {
          try {
            // to delete an entry, pretend to set the datastore = {delete: [name]}
            if (typeof new_val.addons.datastore.delete === "string") {
              await db.project_datastore_del(
                account_id,
                new_val.project_id,
                new_val.addons.datastore.delete
              );
              cb(undefined);
            } else {
              // query should set addons.datastore.[new key] = config, such that we see here
              // new_val = {"project_id":"...","addons":{"datastore":{"key3":{"type":"xxx", ...}}}}
              // which will be merged into the existing addons.datastore dict
              const res = await db.project_datastore_set(
                account_id,
                new_val.project_id,
                new_val.addons.datastore
              );
              cb(undefined, res);
            }
          } catch (err) {
            cb(`${err}`);
          }
        },
      },
      get: {
        fields: {
          project_id: true,
          addons: true,
        },
        async instead_of_query(db, opts, cb): Promise<void> {
          if (opts.multi) {
            throw Error("'multi' is not implemented");
          }
          try {
            // important: the config dicts for each key must not expose secret credentials!
            // check if opts.query.addons === null ?!
            const data = await db.project_datastore_get(
              opts.account_id,
              opts.query.project_id
            );
            cb(undefined, data);
          } catch (err) {
            cb(`${err}`);
          }
        },
      },
    },
  },
  fields: {
    project_id: true,
    addons: true,
  },
});

export interface ProjectStatus {
  "project.pid"?: number; // pid of project server process
  "hub-server.port"?: number; // port of tcp server that is listening for conn from hub
  "browser-server.port"?: number; // port listening for http/websocket conn from browser client
  "sage_server.port"?: number; // port where sage server is listening.
  "sage_server.pid"?: number; // pid of sage server process
  secret_token?: string; // long random secret token that is needed to communicate with local_hub
  version?: number; // version number of project code
  disk_MB?: number; // MB of used disk
  installed?: boolean; // whether code is installed
  memory?: {
    count?: number;
    pss?: number;
    rss?: number;
    swap?: number;
    uss?: number;
  }; // output by smem
}

export interface ProjectState {
  error?: string;
  state?: State; // running, stopped, etc.
  time?: Date;
}
