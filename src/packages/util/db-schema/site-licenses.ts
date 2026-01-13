/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

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

import { is_valid_uuid_string } from "../misc";
import { SCHEMA } from "./index";
import { Table } from "./types";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import type { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";

export interface License {
  id: string;
  title?: string;
  description?: string;
  info?: {
    purchased: PurchaseInfo & {
      account_id: string; // who bought this license
    };
  };
  expires?: Date;
  activates: Date;
  created?: Date; // some old licenses don't have this
  last_used?: Date;
  managers: string[];
  quota?: {
    cpu: number;
    ram: number;
    disk: number;
    user: "business" | "academic";
    boost: boolean;
    member: boolean;
    idle_timeout: keyof typeof LicenseIdleTimeouts;
    dedicated_cpu: number;
    dedicated_ram: number;
    always_running: boolean;
  };
  upgrades?: {
    cores: number;
    cpu_shares: number;
    disk_quota: number;
    memory: number;
    mintime: number;
    network: number;
  };
  run_limit: number;
  voucher_code?: string;
  subscription_id?: number;
}

export interface LicenseFromApi extends Partial<License> {
  number_running?: number; // in some cases this can be filled in.
  is_manager: boolean;
}

Table({
  name: "site_licenses",
  fields: {
    id: {
      type: "uuid",
      desc: "ID that determines the license.",
    },
    title: {
      type: "string",
      desc: "Descriptive name of the license, e.g., the class and university or other information.",
      render: { type: "text", editable: true },
    },
    description: {
      type: "string",
      desc: "Longer description of the license, extra notes, etc.",
      render: { type: "text", editable: true },
    },
    info: {
      type: "map",
      desc: "Structured object for admins to store structured information about this license.  This serves a similar purpose to description, but must be a valid JSON object map.  In practice, this is an object {purchased: PurchaseInfo} that records the info that defines the specs and price of the license",
    },
    expires: {
      type: "timestamp",
      desc: "Date when the license expires.  At this point in time the license no longer upgrades projects, and any running upgraded projects have their upgrades removed, which may result in thosoe projects being stoped.  NOTE: licenses may exist in db with expires not set, but we intend to always require it to be set at some point.",
      render: { type: "timestamp", editable: true },
    },
    activates: {
      type: "timestamp",
      desc: "Date when this license starts working.  Before this date, the license can be applied to projects, but nothing happens.",
      render: { type: "timestamp", editable: true },
    },
    created: {
      type: "timestamp",
      desc: "when this license was first created",
    },
    last_used: {
      type: "timestamp",
      desc: "when this license was last used to upgrade a project when the project was starting.  Obviously, we don't update this *every* single time a project starts - it's throttled, so it'll only be updated periodically (maybe once per minute).",
    },
    managers: {
      type: "array",
      pg_type:
        "TEXT[]" /* TODO/NOTE: I made a mistake -- this should have been UUID[]! */,
      desc: "A list of the account_id's of users that are allowed to manage how this site license is being used.",
      render: {
        type: "accounts",
        editable: true,
      },
    },
    restricted: {
      type: "boolean",
      desc: "NOTE IMPLEMENTED YET: If true, then only managers are allowed to add this site license to a project.  If false, anybody who knows the license key can use it on projects.",
    },
    upgrades: {
      type: "map",
      desc: "Map of the upgrades that are applied to a project when it has this site license; this is the same as the settings field of a project, so e.g., {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0}.  This matches with our older purchases and our internal system.  Instead of this one can give quota.  (DEPRECATED but supported?)",
    },
    quota: {
      type: "map",
      desc: "The exact quota a project using this license gets -- {ram: total amount of memory in GB, cpu: total number of shared vCPUs, disk:total GB of disk space, always_running:true/false, member:true/false, user:'academic'|'business'}.  (Plan is) that such a license does not provide upgrades, but instead a fixed quota.",
    },
    run_limit: {
      type: "integer",
      desc: "The maximum number of running projects that may be simultaneously upgraded using this license.  When this is exceeded, older projects have the license automatically removed.  If removal changes project upgrades, then those projects have the upgrades removed and are stopped.",
      render: { type: "number", integer: true, min: 1, editable: true },
    },
    apply_limit: {
      type: "integer",
      desc: "The maximum number of projects that may simultaneously have this license applied to them.  When this is exceeded, older projects have the license automatically removed.  If this changes how the projects are upgraded, then those projects are stopped.",
      render: { type: "number", integer: true, min: 1, editable: true },
    },
    voucher_code: {
      type: "string",
      desc: "If this license was created using a voucher, then this is the code of that voucher.",
    },
    subscription_id: {
      type: "integer",
      descr:
        "If this license automatically renews due to a subscription, then this is the id of that subscription.",
    },
  },
  rules: {
    desc: "Site Licenses",
    anonymous: false,
    primary_key: "id",
    pg_indexes: [
      "subscription_id", // make it fast to get the license for a given subscription
    ],
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
          quota: null,
          run_limit: null,
          apply_limit: null,
          voucher_code: null,
          subscription_id: null,
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
          quota: null,
          run_limit: null,
          apply_limit: null,
        },
      },
    },
  },
});

const MATCHING_SITE_LICENSES_LIMIT = 20; // arbitrary limit.
Table({
  name: "matching_site_licenses",
  fields: {
    search: {
      type: "string",
      desc: "A search query",
    },
    id: true,
    title: true,
    description: true,
    info: true,
    expires: true,
    activates: true,
    created: true,
    last_used: true,
    managers: true,
    restricted: true,
    upgrades: true,
    quota: true,
    run_limit: true,
    apply_limit: true,
    subscription_id: true,
  },
  rules: {
    virtual: true, // don't make an actual table
    desc: "Site Licenses that match a query (default limit of ${MATCHING_SITE_LICENSES_LIMIT} most active)",
    anonymous: false,
    primary_key: ["id"],
    user_query: {
      get: {
        admin: true,
        fields: {
          search: null,
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
          quota: null,
          run_limit: null,
          apply_limit: null,
          subscription_id: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        // We also completely ignore the user-requested fields and just return everything, since
        // in our application this is fine right now (since all fields are always requested).
        async instead_of_query(database, opts, cb): Promise<void> {
          try {
            if (!opts.multi) {
              throw Error(
                "only query requesting multiple results is implemented",
              );
            }
            let limit: number = MATCHING_SITE_LICENSES_LIMIT;
            if (opts.options != null) {
              for (const option of opts.options) {
                if (option["limit"]) {
                  limit = option["limit"];
                }
              }
            }
            cb(
              undefined,
              await database.matching_site_licenses(opts.query.search, limit),
            );
          } catch (err) {
            cb(err);
          }
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
      desc: "Map from license_id to a count of how many *running* projects are using that license right now.  Only includes licenses that are being used.",
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
      desc: "include projects that were running with this license applied at some point since cutoff; E.g., if cutoff is right now, then we get the currently running projects, and if cuttoff is a timestamp a week ago, we get all projects that ran using this license during the last week.  Default: NOW().",
    },
    limit: {
      type: "integer",
      desc: "limit on the number of results to return, to avoid overloading things. Default: 1000.  This is only used by admins so for now having a large limit and no paging is probably fine.",
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
    desc: "Site License usage information for running projects with a particular license",
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
              "query must be an array (you must request to get multiple values back)",
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
      desc: "include projects that were running with this license applied at some point since cutoff; E.g., if cutoff is right now, then we get the currently running projects, and if cuttoff is a timestamp a week ago, we get all projects that ran using this license during the last week.  Default: NOW().",
    },
    number: {
      type: "integer",
      desc: "how many projects using the site license at some point since cutoff",
    },
  },
  rules: {
    virtual: true, // don't make an actual table
    desc: "Virtual table for determining the number of projects that recently used a given site license",
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
              "query must NOT be an array (do not request multiple values back)",
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
              "query must be of the form {license_id:uuid, cutoff?:<date>, count:null...}]",
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
    description: SCHEMA.site_licenses.fields.description,
    expires: SCHEMA.site_licenses.fields.expires,
    activates: SCHEMA.site_licenses.fields.activates,
    upgrades: SCHEMA.site_licenses.fields.upgrades,
    quota: SCHEMA.site_licenses.fields.quota,
    run_limit: SCHEMA.site_licenses.fields.run_limit,
    managers: SCHEMA.site_licenses.fields.managers,
    subscription_id: SCHEMA.site_licenses.fields.subscription_id,
    running: {
      type: "integer",
      desc: "Number of running projects currently using this license.   Regarding security, we assume that if the user knows the license id, then they are allowed to know how many projects are using it.",
    },
    is_manager: {
      type: "boolean",
      desc: "True if user making the query is a manager of this license.  Frontend UI might tell them this and show license code and other links.",
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
          description: null,
          expires: null,
          activates: null,
          upgrades: null,
          quota: null,
          run_limit: null,
          managers: null,
          running: null,
          is_manager: null,
          subscription_id: null,
        },
        // Actual query is implemented using this code below rather than an
        // actual query directly.  TODO: Also, we're lazy and return all fields we
        // know from the site_license_public_info call, even if user doesn't request them all.
        // If the user making the query is a manager of this license they get a list of
        // the managers (otherwise managers isn't set for them.)
        async instead_of_query(database, opts, cb): Promise<void> {
          const id = opts.query.id;
          if (typeof id != "string" || !is_valid_uuid_string(id)) {
            cb("must be a single object query with id specified");
          } else {
            try {
              const info = await database.site_license_public_info(id);
              info.is_manager =
                info.managers != null &&
                info.managers.includes(opts.account_id);
              cb(undefined, info);
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
    desc: "Table for logging when site licenses are used to upgrade running projects.",
    primary_key: ["license_id", "project_id", "start"],
    pg_indexes: ["license_id"],
  },
});

/* Way to get all the licenses that a given user is a manager of. */
Table({
  name: "manager_site_licenses",
  fields: {
    id: true,
    title: true,
    description: true,
    info: true,
    expires: true,
    activates: true,
    created: true,
    last_used: true,
    managers: true,
    upgrades: true,
    quota: true,
    run_limit: true,
    apply_limit: true,
    voucher_code: true,
    subscription_id: true,
  },
  rules: {
    virtual: "site_licenses", // don't make an actual table
    desc: "Licenses that user doing the query is a manager of.",
    anonymous: false,
    primary_key: ["id"],
    user_query: {
      get: {
        admin: false,
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
          upgrades: null,
          quota: null,
          run_limit: null,
          apply_limit: null,
          voucher_code: null,
          subscription_id: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        // We also completely ignore the user-requested fields and just return everything, since
        // in our application this is fine right now (since all fields are always requested).
        async instead_of_query(database, opts, cb): Promise<void> {
          try {
            if (!opts.multi) {
              throw Error(
                "only query requesting multiple results is implemented",
              );
            }
            cb(
              undefined,
              await database.manager_site_licenses(opts.account_id),
            );
          } catch (err) {
            cb(err);
          }
        },
      },
      set: {
        // set is so managers of a license can easily change the title/description at any time
        admin: false,
        fields: {
          id: true,
          title: true,
          description: true,
          managers: true,
        },
        async instead_of_change(
          database,
          old_value,
          new_val,
          account_id,
          cb,
        ): Promise<void> {
          if (old_value == null) {
            cb("must provide primary key");
            return;
          }
          if (new_val.managers != null) {
            // never allow removing the person who created the license.
            // They are old_value.info.purchased.account_id
            // This is mainly motivated by how subscriptions work, but generally
            // seems like a good idea.
            const owner_id = old_value.info?.purchased?.account_id;
            if (owner_id != null && !new_val.managers.includes(owner_id)) {
              cb(
                "you cannot remove as manager the person who originally purchased the license",
              );
              return;
            }
          }

          try {
            await database.site_license_manager_set(account_id, new_val);
            cb();
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});
