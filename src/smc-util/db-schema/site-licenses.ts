import { create } from "./types";
import { is_valid_uuid_string } from "../misc2";

/* This will be a table of all site licenses.

TODO:
There are many fields below and statements about limits, etc., but this
is NOT all implemented yet.  **This is just the plan.**  We also might
make the limits more like quota where they are more like soft limits,
and we have a little wiggle room.

- [ ] Initially this table will be only readable/writable by the cocalc.com admins.
Later there will be a virtual table version of this that grants (read-only)
access to users.

- [ ] Add a virtual table to return data about how a given license is *actually* being used across all projects.  Idea is site_licenses.users (and also us cocalc.com admins) will query this for active licenses to see what's going on.

*/

export const site_licenses = create({
  fields: {
    id: {
      type: "uuid",
      desc: "ID that determines the license."
    },
    title: {
      type: "string",
      desc:
        "Descriptive name of the license, e.g., the class and university or other information."
    },
    description: {
      type: "string",
      desc: "Longer description of the license, extra notes, etc."
    },
    expires: {
      type: "timestamp",
      desc:
        "Date when the license expires.  At this point in time the license no longer upgrades projects, and any running upgraded projects have their upgrades removed, which may result in thosoe projects being stoped."
    },
    activates: {
      type: "timestamp",
      desc:
        "Date when this license starts working.  Before this date, the license can be applied to projects, but nothing happens."
    },
    created: {
      type: "timestamp",
      desc: "when this license was first created"
    },
    last_used: {
      type: "timestamp",
      desc:
        "when this license was last used to upgrade a project when the project was starting.  Obviously, we don't update this *every* single time a project starts - it's throttled, so it'll only be updated periodically (maybe once per minute)."
    },
    managers: {
      type: "array",
      pg_type: "TEXT[]",
      desc:
        "A list of the account_id's of users that are allowed to manage how this site license is being used."
    },
    restricted: {
      type: "boolean",
      desc:
        "If true, then only managers are allowed to add this site license to a project.  If false, anybody who knows the license key can use it on projects."
    },
    upgrades: {
      type: "map",
      desc:
        "Map of the upgrades that are applied to a project when it has this site license; this is the same as the settings field of a project, so e.g., {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0}."
    },
    run_limit: {
      type: "integer",
      desc:
        "The maximum number of running projects that may be simultaneously upgraded using this license.  When this is exceeded, older projects have the license automatically removed.  If removal changes project upgrades, then those projects have the upgrades removed and are stopp."
    },
    apply_limit: {
      type: "integer",
      desc:
        "The maximum number of projects that may simultaneously have this license applied to them.  When this is exceeded, older projects have the license automatically removed.  If this changes how the projects are upgraded, then those projects are stopped."
    }
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
          expires: null,
          activates: null,
          created: null,
          last_used: null,
          managers: null,
          restricted: null,
          upgrades: null,
          run_limit: null,
          apply_limit: null
        }
      },
      set: {
        admin: true,
        fields: {
          id: null,
          title: null,
          description: null,
          expires: null,
          activates: null,
          created: null,
          last_used: null,
          managers: null,
          restricted: null,
          upgrades: null,
          run_limit: null,
          apply_limit: null
        }
      }
    }
  }
});

// A virtual table that can be queried only by admins and gets global information
// about how site licenses are currently being used by active projects.

export const site_license_usage_stats = create({
  fields: {
    running: {
      type: "map",
      desc:
        "Map from license_id to a count of how many *running* projects are using that license right now.  Only includes licenses that are being used."
    },
    time: {
      type: "timestamp",
      desc: "When the data was grabbed."
    }
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
          time: null
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
        }
      }
    }
  }
});

import { schema } from "./db-schema";
export const projects_using_site_license = create({
  fields: {
    license_id: {
      type: "string",
      desc: "the id of the license"
    },
    project_id: schema.projects.project_id,
    title: schema.projects.title,
    description: schema.projects.description,
    users: schema.projects.users,
    last_active: schema.projects.last_active,
    last_edited: schema.projects.last_edited
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
          project_id: null,
          title: null,
          description: null,
          users: null,
          last_active: null,
          last_edited: null
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        async instead_of_query(database, opts, cb): Promise<void> {
          if (!opts.multi) {
            cb("query must be an array (getting multiple values back)");
            return;
          }
          const obj = opts.query;
          if (typeof obj != "object" || !is_valid_uuid_string(obj.license_id)) {
            cb("query must be of the form [{license_id:uuid, ...}]");
            return;
          }
          const fields: string[] = [];
          for (const field of [
            // this approach ensures requests for bad fields don't cause SQL injection...
            "project_id",
            "title",
            "description",
            "users",
            "last_active",
            "last_edited"
          ]) {
            if (obj[field] === null) {
              // === is important here since we don't want to pick up not set field!
              fields.push(field);
            }
          }
          try {
            const projects = await database.projects_using_site_license(
              obj.license_id,
              fields
            );
            for (const project of projects) {
              // for consistency with how queries work, we fill this in.
              project.license_id = obj.license_id;
            }
            cb(undefined, projects);
          } catch (err) {
            cb(err);
          }
        }
      }
    }
  }
});

// Get publicly available information about a site license.
// User just has to know the license id to get this info.
//
export const site_license_public_info = create({
  fields: {
    id: site_licenses.fields.id,
    title: site_licenses.fields.title,
    expires: site_licenses.fields.expires,
    activates: site_licenses.fields.activates
  },
  rules: {
    desc: "Publicly available information about site licenses",
    anonymous: false,  // do need to be signed in.
    primary_key: ["id"],
    virtual: "site_licenses",
    user_query: {
      get: {
        admin: false,
        check_hook: (_db, obj, _account_id, _project_id, cb) => {
          if (typeof obj.id == "string" && is_valid_uuid_string(obj.id)) {
            cb(); // good
          } else {
            cb("id must be a uuid");
          }
        },
        fields: {
          id: true,
          title: true,
          expires: true,
          activates: true
        }
      }
    }
  }
});
