/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { State } from "@cocalc/util/compute-states";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { deep_copy } from "@cocalc/util/misc";
import {
  ExecuteCodeOptions,
  ExecuteCodeOptionsAsyncGet,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import { type RegistrationTokenCustomize } from "@cocalc/util/types/registration-token";
import { DEFAULT_QUOTAS } from "@cocalc/util/upgrade-spec";
import { isUserGroup } from "@cocalc/util/project-ownership";

import { NOTES } from "./crm";
import { FALLBACK_COMPUTE_IMAGE } from "./defaults";
import { SCHEMA as schema } from "./index";
import { callback2 } from "@cocalc/util/async-utils";
import { Table } from "./types";

export const MAX_FILENAME_SEARCH_RESULTS = 100;

const PROJECTS_LIMIT = 300;
const PROJECTS_CUTOFF = "6 weeks";
const THROTTLE_CHANGES = 1000;

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
      "lti_id",
      "USING GIN (state)", // so getting all running projects is fast (e.g. for site_license_usage_log... but also manage-state)
      "((state #>> '{state}'))", // projecting the "state" (running, etc.) for its own index – the GIN index above still causes a scan, which we want to avoid.
      "((state ->> 'state'))", // same reason as above. both syntaxes appear and we have to index both.
      "((state IS NULL))", // not covered by the above
      "((settings ->> 'always_running'))", // to quickly know which projects have this setting
      "((run_quota ->> 'always_running'))", // same reason as above
      "deleted", // in various queries we quickly fiter deleted projects
      "site_license", // for queries across projects related to site_license#>>{license_id}
    ],

    crm_indexes: ["last_edited"],

    user_query: {
      get: {
        pg_where: [
          `last_edited >= NOW() - interval '${PROJECTS_CUTOFF}'`,
          "projects",
        ],
        pg_where_load: ["last_edited >= NOW() - interval '7 days'", "projects"],
        options: [{ limit: PROJECTS_LIMIT, order_by: "-last_edited" }],
        options_load: [{ limit: 50, order_by: "-last_edited" }],
        pg_changefeed: "projects",
        throttle_changes: THROTTLE_CHANGES,
        fields: {
          project_id: null,
          name: null,
          title: "",
          description: "",
          users: {},
          invite: null, // who has been invited to this project via email
          invite_requests: null, // who has requested to be invited
          deleted: null,
          host: null,
          settings: DEFAULT_QUOTAS,
          run_quota: null,
          site_license: null,
          status: null,
          manage_users_owner_only: null,
          // security model is anybody with access to the project should be allowed to know this token.
          secret_token: null,
          state: null,
          last_edited: null,
          last_active: null,
          action_request: null, // last requested action -- {action:?, time:?, started:?, finished:?, err:?}
          course: null,
          // if the value is not set, we have to use the old default prior to summer 2020 (Ubuntu 18.04, not 20.04!)
          compute_image: FALLBACK_COMPUTE_IMAGE,
          created: null,
          ephemeral: null,
          env: null,
          sandbox: null,
          avatar_image_tiny: null,
          // do NOT add avatar_image_full here or it will get included in changefeeds, which we don't want.
          // instead it gets its own virtual table.
          color: null,
          pay_as_you_go_quotas: null,
        },
      },
      set: {
        // NOTE: for security reasons users CANNOT set the course field via a user query;
        // instead use the api/v2/projects/course/set-course-field api endpoint.
        fields: {
          project_id: "project_write",
          title: true,
          name: true,
          description: true,
          deleted: true,
          invite_requests: true, // project collabs can modify this (e.g., to remove from it once user added or rejected)
          users(obj, db, account_id) {
            return db._user_set_query_project_users(obj, account_id);
          },
          manage_users_owner_only(obj, db, account_id) {
            return db._user_set_query_project_manage_users_owner_only(
              obj,
              account_id,
            );
          },
          action_request: true, // used to request that an action be performed, e.g., "save"; handled by before_change
          compute_image: true,
          site_license: true,
          env: true,
          sandbox: true,
          avatar_image_tiny: true,
          avatar_image_full: true,
          color: true,
        },
        required_fields: {
          project_id: true,
        },
        async check_hook(db, obj, account_id, _project_id, cb) {
          // Validate manage_users_owner_only permission if it's being changed
          if (obj.manage_users_owner_only !== undefined) {
            try {
              // Require actor identity before hitting the database
              if (!account_id) {
                throw Error(
                  "account_id is required to change manage_users_owner_only",
                );
              }

              const siteSettings =
                (await callback2(db.get_server_settings_cached, {})) ?? {};
              const siteEnforced = !!siteSettings.strict_collaborator_management;
              if (siteEnforced && obj.manage_users_owner_only !== true) {
                throw Error(
                  "Collaborator management is enforced by the site administrator and cannot be disabled.",
                );
              }

              const { rows } = await db.async_query({
                query: "SELECT users FROM projects WHERE project_id = $1",
                params: [obj.project_id],
              });
              const users = rows?.[0]?.users ?? {};

              // Check that the user making the change is an owner
              const group = users?.[account_id]?.group;
              if (!isUserGroup(group) || group !== "owner") {
                throw Error(
                  "Only project owners can change collaborator management settings",
                );
              }
            } catch (err) {
              cb(err.toString());
              return;
            }
          }
          cb();
        },
        before_change(database, old_val, new_val, account_id, cb) {
          database._user_set_query_project_change_before(
            old_val,
            new_val,
            account_id,
            cb,
          );
        },

        on_change(database, old_val, new_val, account_id, cb) {
          database._user_set_query_project_change_after(
            old_val,
            new_val,
            account_id,
            cb,
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
    name: {
      type: "string",
      pg_type: "VARCHAR(100)",
      desc: "The optional name of this project.  Must be globally unique (up to case) across all projects with a given *owner*.  It can be between 1 and 100 characters from a-z A-Z 0-9 period and dash.",
      render: { type: "text", maxLen: 100, editable: true },
    },
    title: {
      type: "string",
      desc: "The short title of the project. Should use no special formatting, except hashtags.",
      render: { type: "project_link", project_id: "project_id" },
    },
    description: {
      type: "string",
      desc: "A longer textual description of the project.  This can include hashtags and should be formatted using markdown.",
      render: {
        type: "markdown",
        maxLen: 1024,
        editable: true,
      },
    }, // markdown rendering possibly not implemented
    users: {
      title: "Collaborators",
      type: "map",
      desc: "This is a map from account_id's to {hide:bool, group:'owner'|'collaborator', upgrades:{memory:1000, ...}, ssh:{...}}.",
      render: { type: "usersmap", editable: true },
    },
    manage_users_owner_only: {
      type: "boolean",
      desc: "If true, only project owners can add or remove collaborators. Collaborators can still remove themselves. Disabled by default (undefined or false means current behavior where collaborators can manage other collaborators).",
      render: { type: "boolean", editable: true },
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
      render: { type: "boolean", editable: true },
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
      desc: "This is a map that defines upgrades (just when running the project) that come from a site license, and also the licenses that are applied to this project.  The format is {license_id:{memory:?, mintime:?, ...}} where the target of the license_id is the same as for the settings field. The license_id is the uuid of the license that contributed these upgrades.  To tell cocalc to use a license for a project, a user sets site_license to {license_id:{}}, and when it is requested to start the project, the backend decides what allocation license_id provides and changes the field accordingly, i.e., changes {license_id:{},...} to {license_id:{memory:?,...},...}",
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
    ephemeral: {
      type: "number",
      desc: "If set, number of milliseconds this project may exist after creation.",
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
      desc: "{project_id:[id of project that contains .course file], path:[path to .course file], pay:?, payInfo:?, email_address:[optional email address of student -- used if account_id not known], account_id:[account id of student]}, where pay is either not set (or equals falseish) or is a timestamp by which the students must pay. If payInfo is set, it specifies the parameters of the license the students should purchase.",
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
      desc: "Specify the name of the underlying (kucalc) compute image.",
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
      render: { type: "json", editable: true },
    },
    sandbox: {
      type: "boolean",
      desc: "If set to true, then any user who attempts to access this project is automatically added as a collaborator to it.   Only the project owner can change this setting.",
      render: { type: "boolean", editable: true },
    },
    avatar_image_tiny: {
      title: "Image",
      type: "string",
      desc: "tiny (32x32) visual image associated with the project. Suitable to include as part of changefeed, since about 3kb.",
      render: { type: "image" },
    },
    avatar_image_full: {
      title: "Image",
      type: "string",
      desc: "A visual image associated with the project.  Could be 150kb.  NOT include as part of changefeed of projects, since potentially big (e.g., 200kb x 1000 projects = 200MB!).",
      render: { type: "image" },
    },
    color: {
      title: "Color",
      type: "string",
      desc: "Optional color associated with the project, used for visual identification (e.g., border color in project list).",
      render: { type: "text" },
    },
    pay_as_you_go_quotas: {
      type: "map",
      desc: "Pay as you go quotas that users set so that when they run this project, it gets upgraded to at least what is specified here, and user gets billed later for what is used.  Any changes to this table could result in money being spent, so should only be done via the api.  This is a map from the account_id of the user that set the quota to the value of the quota spec (which is purchase-quotas.ProjectQuota).",
      render: { type: "json", editable: false },
    },
    notes: NOTES,
    secret_token: {
      type: "string",
      pg_type: "VARCHAR(256)",
      desc: "Random ephemeral secret token used temporarily by project to authenticate with hub.",
    },
  },
});

export interface ApiKeyInfo {
  name: string;
  trunc: string;
  hash?: string;
  used?: number;
}

// Same query above, but without the last_edited time constraint.
schema.projects_all = deep_copy(schema.projects);
if (
  schema.projects_all.user_query?.get == null ||
  schema.projects.user_query?.get == null
) {
  throw Error("make typescript happy");
}
schema.projects_all.user_query.get.options = [];
schema.projects_all.user_query.get.options_load = [];
schema.projects_all.virtual = "projects";
schema.projects_all.user_query.get.pg_where = ["projects"];
schema.projects_all.user_query.get.pg_where_load = ["projects"];

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
Virtual table to get project avatar_images.
We don't put this in the main projects table,
since we don't want the avatar_image_full to be
the projects queries or changefeeds, since it
is big, and by default all get fields appear there.
*/

Table({
  name: "project_avatar_images",
  rules: {
    virtual: "projects",
    primary_key: "project_id",
    user_query: {
      get: {
        pg_where: ["projects"],
        fields: {
          project_id: null,
          avatar_image_full: null,
        },
      },
    },
  },
  fields: {
    project_id: true,
    avatar_image_full: true,
  },
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
          cb,
        ): Promise<void> {
          try {
            // to delete an entry, pretend to set the datastore = {delete: [name]}
            if (typeof new_val.addons.datastore.delete === "string") {
              await db.project_datastore_del(
                account_id,
                new_val.project_id,
                new_val.addons.datastore.delete,
              );
              cb(undefined);
            } else {
              // query should set addons.datastore.[new key] = config, such that we see here
              // new_val = {"project_id":"...","addons":{"datastore":{"key3":{"type":"xxx", ...}}}}
              // which will be merged into the existing addons.datastore dict
              const res = await db.project_datastore_set(
                account_id,
                new_val.project_id,
                new_val.addons.datastore,
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
              opts.query.project_id,
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
  start_ts?: number; // timestamp, when project server started
  session_id?: string; // unique identifyer
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
  ip?: string; // where the project is running
  error?: string;
  state?: State; // running, stopped, etc.
  time?: Date;
}

Table({
  name: "crm_projects",
  fields: schema.projects.fields,
  rules: {
    primary_key: schema.projects.primary_key,
    virtual: "projects",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        // (without this, users who have read access could read)
        pg_where: [],
        fields: {
          ...schema.projects.user_query?.get?.fields,
          notes: null,
        },
      },
      set: {
        admin: true,
        fields: {
          project_id: true,
          name: true,
          title: true,
          description: true,
          deleted: true,
          notes: true,
        },
      },
    },
  },
});

export type Datastore = boolean | string[] | undefined;

// in the future, we might want to extend this to include custom environmment variables
export interface EnvVarsRecord {
  inherit?: boolean;
}
export type EnvVars = EnvVarsRecord | undefined;

export interface StudentProjectFunctionality {
  disableActions?: boolean;
  disableJupyterToggleReadonly?: boolean;
  disableJupyterClassicServer?: boolean;
  disableJupyterClassicMode?: boolean;
  disableJupyterLabServer?: boolean;
  disableRServer?: boolean;
  disableVSCodeServer?: boolean;
  disableLibrary?: boolean;
  disableNetworkWarningBanner?: boolean;
  disablePlutoServer?: boolean;
  disableTerminals?: boolean;
  disableUploads?: boolean;
  disableNetwork?: boolean;
  disableSSH?: boolean;
  disableCollaborators?: boolean;
  disableChatGPT?: boolean;
  disableSharing?: boolean;
}

export interface CourseInfo {
  type: "student" | "shared" | "nbgrader";
  account_id?: string; // account_id of the student that this project is for.
  project_id: string; // the course project, i.e., project with the .course file
  path: string; // path to the .course file in project_id
  pay?: string; // iso timestamp or ""
  paid?: string; // iso timestamp with *when* they paid.
  purchase_id?: number; // id of purchase record in purchases table.
  payInfo?: PurchaseInfo;
  email_address?: string;
  datastore: Datastore;
  student_project_functionality?: StudentProjectFunctionality;
  envvars?: EnvVars;
}

type ExecOptsCommon = {
  project_id: string;
  cb?: Function; // if given use a callback interface *instead* of async.
};

export type ExecOptsBlocking = ExecOptsCommon & {
  compute_server_id?: number; // if true, run on the compute server (if available)
  filesystem?: boolean; // run in fileserver container on compute server; otherwise, runs on main compute container.
  path?: string;
  command: string;
  args?: string[];
  timeout?: number;
  max_output?: number;
  bash?: boolean;
  aggregate?: string | number | { value: string | number };
  err_on_exit?: boolean;
  env?: { [key: string]: string }; // custom environment variables.
  async_call?: ExecuteCodeOptions["async_call"];
};

export type ExecOptsAsync = ExecOptsCommon & {
  async_get?: ExecuteCodeOptionsAsyncGet["async_get"];
  async_stats?: ExecuteCodeOptionsAsyncGet["async_stats"];
  async_await?: ExecuteCodeOptionsAsyncGet["async_await"];
};

export type ExecOpts = ExecOptsBlocking | ExecOptsAsync;

export function isExecOptsBlocking(opts: unknown): opts is ExecOptsBlocking {
  return (
    typeof opts === "object" &&
    typeof (opts as any).project_id === "string" &&
    typeof (opts as any).command === "string"
  );
}

export type ExecOutput = ExecuteCodeOutput & {
  time: number; // time in ms, from user point of view.
};

export interface CreateProjectOptions {
  account_id?: string;
  title?: string;
  description?: string;
  // (optional) image ID
  image?: string;
  // (optional) license id (or multiple ids separated by commas) -- if given, project will be created with this license
  license?: string;
  public_path_id?: string; // may imply use of a license
  // noPool = do not allow using the pool (e.g., need this when creating projects to put in the pool);
  // not a real issue since when creating for pool account_id is null, and then we wouldn't use the pool...
  noPool?: boolean;
  // start running the moment the project is created -- uses more resources, but possibly better user experience
  start?: boolean;

  // admins can specify the project_id - nobody else can -- useful for debugging.
  project_id?: string;
  // if set, project should be treated as expiring after this many milliseconds since creation
  ephemeral?: number;
  // account customization settings to apply to project (e.g., disableInternet)
  customize?: RegistrationTokenCustomize;
}

interface BaseCopyOptions {
  target_project_id?: string;
  target_path?: string; // path into project; if not given, defaults to source path above.
  overwrite_newer?: boolean; // if true, newer files in target are copied over (otherwise, uses rsync's --update)
  delete_missing?: boolean; // if true, delete files in dest path not in source, **including** newer files
  backup?: boolean; // make backup files
  timeout?: number; // in **seconds**, not milliseconds
  bwlimit?: number;
  wait_until_done?: boolean; // by default, wait until done. false only gives the ID to query the status later
  scheduled?: string | Date; // kucalc only: string (parseable by new Date()), or a Date
  public?: boolean; // kucalc only: if true, may use the share server files rather than start the source project running
  exclude?: string[]; // options passed to rsync via --exclude
}
export interface UserCopyOptions extends BaseCopyOptions {
  account_id?: string;
  src_project_id: string;
  src_path: string;
  // simulate copy taking at least this long -- useful for dev/debugging.
  debug_delay_ms?: number;
}

// for copying files within and between projects
export interface CopyOptions extends BaseCopyOptions {
  path: string;
}
