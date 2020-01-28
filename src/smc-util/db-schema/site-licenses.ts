import { create } from "./types";

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
    users: {
      type: "array",
      pg_type: "TEXT[]",
      desc:
        "A list of the account_id's of users that are allowed to see information about how this site license is being used."
    },
    restricted: {
      type: "boolean",
      desc:
        "If true, then only users are allowed to set this site license on a project.  If false, anybody who knows the license key can use it on projects."
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
          users: null,
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
          users: null,
          restricted: null,
          upgrades: null,
          run_limit: null,
          apply_limit: null
        }
      }
    }
  }
});
