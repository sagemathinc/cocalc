/*
Table of all site licenses.

From wikipedia https://en.wikipedia.org/wiki/Site_license: "A site license is a type of software license that allows the user to install a software package in several computers simultaneously, such as at a particular site (facility) or across a corporation.[1] Depending on the amount of fees paid, the license may be unlimited or may limit simultaneous access to a certain number of users. The latter is called a concurrent site license.[2]"

That's sort of what we're doing here.  We've defined a license that let's users
*use* several upgraded projects with simultaneous access limits
(e.g., number of projects at once).

A possibly confusing point is that a single University might have many site
licenses for different purposes (e.g., one license for faculty and one license
for students).
*/

import { is_valid_uuid_string } from "../misc2";
import { Table } from "./types";
import { SCHEMA } from "./index";

Table({
  name: "site_licenses",
  fields: {
    id: {
      type: "uuid",
      desc: "ID that determines the license.",
    },
    title: {
      type: "string",
      desc:
        "Descriptive name of the license, e.g., the class and university or other information.",
    },
    description: {
      type: "string",
      desc: "Longer description of the license, extra notes, etc.",
    },
    info: {
      type: "map",
      desc:
        "Structured object for admins to store structured information about this license.  This serves a similar purpose to description, but must be a valid JSON object map.",
    },
    expires: {
      type: "timestamp",
      desc:
        "Date when the license expires.  At this point in time the license no longer upgrades projects, and any running upgraded projects have their upgrades removed, which may result in thosoe projects being stoped.",
    },
    activates: {
      type: "timestamp",
      desc:
        "Date when this license starts working.  Before this date, the license can be applied to projects, but nothing happens.",
    },
    created: {
      type: "timestamp",
      desc: "when this license was first created",
    },
    last_used: {
      type: "timestamp",
      desc:
        "when this license was last used to upgrade a project when the project was starting.  Obviously, we don't update this *every* single time a project starts - it's throttled, so it'll only be updated periodically (maybe once per minute).",
    },
    managers: {
      type: "array",
      pg_type: "TEXT[]",
      desc:
        "A list of the account_id's of users that are allowed to manage how this site license is being used.",
    },
    restricted: {
      type: "boolean",
      desc:
        "NOTE IMPLEMENTED YET: If true, then only managers are allowed to add this site license to a project.  If false, anybody who knows the license key can use it on projects.",
    },
    upgrades: {
      type: "map",
      desc:
        "Map of the upgrades that are applied to a project when it has this site license; this is the same as the settings field of a project, so e.g., {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0}.",
    },
    run_limit: {
      type: "integer",
      desc:
        "The maximum number of running projects that may be simultaneously upgraded using this license.  When this is exceeded, older projects have the license automatically removed.  If removal changes project upgrades, then those projects have the upgrades removed and are stopped.",
    },
    apply_limit: {
      type: "integer",
      desc:
        "The maximum number of projects that may simultaneously have this license applied to them.  When this is exceeded, older projects have the license automatically removed.  If this changes how the projects are upgraded, then those projects are stopped.",
    },
  },
  rules: {
    desc: "Site Licenses",
    anonymous: false,
    primary_key: "id",
    pg_indexes: [],
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        options: [{ order_by: "-last_used" }, { limit: 500 }],
        fields: {
          id: null,
          title: null,
          description: null,
          info: null,
          expires: null,
          activates: null,
          created: null,
          last_used: null,
          managers: null,
          restricted: null,
          upgrades: null,
          run_limit: null,
          apply_limit: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: null,
          title: null,
          description: null,
          info: null,
          expires: null,
          activates: null,
          created: null,
          last_used: null,
          managers: null,
          restricted: null,
          upgrades: null,
          run_limit: null,
          apply_limit: null,
        },
      },
    },
  },
});

// A virtual table that can be queried only by admins and gets global information
// about how site licenses are currently being used by active projects.

Table({
  name: "site_license_usage_stats",
  fields: {
    running: {
      type: "map",
      desc:
        "Map from license_id to a count of how many *running* projects are using that license right now.  Only includes licenses that are being used.",
    },
    time: {
      type: "timestamp",
      desc: "When the data was grabbed.",
    },
  },
  rules: {
    virtual: true, // don't make an actual table
    desc: "Site License usage information for running projects",
    anonymous: false,
    primary_key: ["time"],
    user_query: {
      get: {
        admin: true,
        fields: {
          running: null,
          time: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        async instead_of_query(database, opts, cb): Promise<void> {
          const obj: any = Object.assign({}, opts.query);
          try {
            obj.running = await database.site_license_usage_stats();
            obj.time = new Date();
            cb(undefined, obj);
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});

Table({
  name: "projects_using_site_license",
  fields: {
    license_id: {
      type: "string",
      desc: "the id of the license -- must be specified",
    },
    cutoff: {
      type: "timestamp",
      desc:
        "include projects that were running with this license applied at some point since cutoff; E.g., if cutoff is right now, then we get the currently running projects, and if cuttoff is a timestamp a week ago, we get all projects that ran using this license during the last week.  Default: NOW().",
    },
    limit: {
      type: "integer",
      desc:
        "limit on the number of results to return, to avoid overloading things. Default: 1000.  This is only used by admins so for now having a large limit and no paging is probably fine.",
    },
    project_id: SCHEMA.projects.fields.project_id, // id of project
    title: SCHEMA.projects.fields.title, // first 80 characters of title of project
    description: SCHEMA.projects.fields.description, // first 80 characters of description of project
    users: SCHEMA.projects.fields.users, // users of the project
    last_active: SCHEMA.projects.fields.last_active, // who last active used project
    last_edited: SCHEMA.projects.fields.last_edited, // when project was last edited
  },
  rules: {
    virtual: true, // don't make an actual table
    desc:
      "Site License usage information for running projects with a particular license",
    anonymous: false,
    primary_key: ["license_id", "project_id"],
    user_query: {
      get: {
        admin: true, // for now admins only; TODO: later *managers* of the site license will also get access...
        fields: {
          license_id: null,
          cutoff: null,
          limit: null,
          project_id: null,
          title: null,
          description: null,
          users: null,
          last_active: null,
          last_edited: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        async instead_of_query(database, opts, cb): Promise<void> {
          if (!opts.multi) {
            cb(
              "query must be an array (you must request to get multiple values back)"
            );
            return;
          }
          const obj = opts.query;
          if (typeof obj != "object" || !is_valid_uuid_string(obj.license_id)) {
            cb("query must be of the form [{license_id:uuid, ...}]");
            return;
          }
          if (!obj.limit) {
            obj.limit = 1000;
          }
          const fields: string[] = [];
          for (const field of [
            // this approach ensures requests for bad fields don't cause SQL injection...
            "project_id",
            "title",
            "description",
            "users",
            "last_active",
            "last_edited",
          ]) {
            if (obj[field] === null) {
              // === is important here since we don't want to pick up not set field!
              fields.push(field);
            }
          }
          try {
            const projects = await database.projects_using_site_license({
              license_id: obj.license_id,
              fields: fields,
              cutoff: obj.cutoff,
              limit: obj.limit,
              truncate: 80,
            });
            for (const project of projects) {
              // for consistency with how queries work, we fill this in.
              project.license_id = obj.license_id;
            }
            cb(undefined, projects);
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});

Table({
  name: "number_of_projects_using_site_license",
  fields: {
    license_id: {
      type: "string",
      desc: "the id of the license -- must be specified",
    },
    cutoff: {
      type: "timestamp",
      desc:
        "include projects that were running with this license applied at some point since cutoff; E.g., if cutoff is right now, then we get the currently running projects, and if cuttoff is a timestamp a week ago, we get all projects that ran using this license during the last week.  Default: NOW().",
    },
    number: {
      type: "integer",
      desc:
        "how many projects using the site license at some point since cutoff",
    },
  },
  rules: {
    virtual: true, // don't make an actual table
    desc:
      "Virtual table for determining the number of projects that recently used a given site license",
    anonymous: false,
    primary_key: ["license_id", "cutoff"],
    user_query: {
      get: {
        admin: true, // for now admins only; TODO: later *managers* of the site license will also get access...
        fields: {
          license_id: null,
          cutoff: null,
          number: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        async instead_of_query(database, opts, cb): Promise<void> {
          if (opts.multi) {
            cb(
              "query must NOT be an array (do not request multiple values back)"
            );
            return;
          }
          const obj = opts.query;
          if (
            typeof obj != "object" ||
            !is_valid_uuid_string(obj.license_id) ||
            obj.number != null
          ) {
            cb(
              "query must be of the form {license_id:uuid, cutoff?:<date>, count:null...}]"
            );
            return;
          }
          try {
            obj.number = await database.number_of_projects_using_site_license({
              license_id: obj.license_id,
              cutoff: obj.cutoff,
            });
            cb(undefined, obj);
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});

// Get publicly available information about a site license.
// User just has to know the license id to get this info.
//
if (SCHEMA?.site_licenses?.fields == null) throw Error("bug"); // for typescript

Table({
  name: "site_license_public_info",
  fields: {
    id: SCHEMA.site_licenses.fields.id, // must be specified or it is an error
    title: SCHEMA.site_licenses.fields.title,
    expires: SCHEMA.site_licenses.fields.expires,
    activates: SCHEMA.site_licenses.fields.activates,
    upgrades: SCHEMA.site_licenses.fields.upgrades,
    run_limit: SCHEMA.site_licenses.fields.run_limit,
    running: {
      type: "integer",
      desc:
        "Number of running projects currently using this license.   Regarding security, we assume that if the user knows the license id, then they are allowed to know how many projects are using it.",
    },
  },
  rules: {
    desc: "Publicly available information about site licenses",
    anonymous: false, // do need to be signed in.
    primary_key: ["id"],
    virtual: true, // no actual table.
    user_query: {
      get: {
        admin: false,
        fields: {
          id: null,
          title: null,
          expires: null,
          activates: null,
          upgrades: null,
          run_limit: null,
          running: null,
        },
        // Actual query is implemented using this code below rather than an
        // actual query directly.  TODO: Also, we're lazy and return all fields we
        // know, even if user doesn't request them all.
        async instead_of_query(database, opts, cb): Promise<void> {
          const id = opts.query.id;
          if (typeof id != "string" || !is_valid_uuid_string(id)) {
            cb("must be a single object query with id specified");
          } else {
            try {
              cb(undefined, await database.site_license_public_info(id));
            } catch (err) {
              cb(err);
            }
          }
        },
      },
    },
  },
});

Table({
  name: "site_license_usage_log",
  fields: {
    license_id: {
      type: "uuid",
      desc: "id of the site license",
    },
    project_id: {
      type: "uuid",
      desc: "id of the project",
    },
    start: {
      type: "timestamp",
      desc: "When the project started running using this site license",
    },
    stop: {
      type: "timestamp",
      desc: "When the project stopped running using this site license",
    },
  },
  rules: {
    desc:
      "Table for logging when site licenses are used to upgrade running projects.",
    primary_key: ["license_id", "project_id", "start"],
    pg_indexes: ["license_id"],
  },
});
