/*
Table of organizations.

WARNING: Organizations are far from actually being implemented
fully in Cocalc!  I just figure defining this can't hurt to get
the ball rollowing.
*/

import { Table } from "./types";
import { checkAccountName as checkOrganizationName } from "./name-rules";

Table({
  name: "organizations",
  fields: {
    organization_id: {
      type: "uuid",
      desc: "The uuid that determines this organization",
    },
    created: {
      type: "timestamp",
      desc: "When the organization was created.",
    },
    deleted: {
      type: "boolean",
      desc: "True if this organization has been deleted.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(39)",
      desc: "The name of this organization (used for URL's).  This is optional but globally unique across all organizations *and* accounts.  It can be between 1 and 39 characters from a-z A-Z 0-9 - and must not start with a dash.",
    },
    title: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Title of this organization",
    },
    description: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Description of this organization.",
    },
    link: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Optional URL of this organization (e.g., their webpage).",
    },
    email_address: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Optional email address to reach this organization.",
    },
    api_key: {
      type: "string",
      desc: "Optional API key that grants full API access to all projects that this organization owns. Key is of the form 'sk_9QabcrqJFy7JIhvAGih5c6Nb', where the random part is 24 characters (base 62).",
    },
    profile: {
      type: "map",
      desc: "Information related to displaying an avatar for this organization.",
    },
    users: {
      type: "map",
      desc: "This is a map from account_id to 'owner' | 'member'.",
    },
    invitations: {
      type: "map",
      desc: "This is a map from account_id to {created:timestamp, status:'pending'|'invited'|'accepted'|'denied', emailed:timestamp}",
    },
  },
  rules: {
    desc: "All organizations.",
    primary_key: "organization_id",
    pg_indexes: [
      "(lower(title) text_pattern_ops)",
      "(lower(description)  text_pattern_ops)",
      "api_key",
    ],
    pg_unique_indexes: [
      "LOWER(name)", // see comments for accounts table.
    ],
    user_query: {
      get: {
        throttle_changes: 500,
        pg_where: [{ "organization_id = $::UUID": "organization_id" }],
        fields: {
          organization_id: null,
          email_address: null,
          name: "",
          title: "",
          description: "",
          profile: {
            image: undefined,
            color: undefined,
          },
          created: null,
        },
      },
      set: {
        fields: {
          organization_id: true,
          name: true,
          title: true,
          description: true,
          profile: true,
        },
        required_fields: {
          organization_id: true,
        },
        async check_hook(db, obj, account_id, _project_id, cb) {
          // Check that account_id is a member of this organization
          // via a db query, since otherwise no permission to do anything.
          if (
            !(await db.accountIsInOrganization({
              account_id,
              organization_id: obj["organization_id"],
            }))
          ) {
            cb(`account must be a member of the organization`);
            return;
          }

          if (obj["name"] != null) {
            try {
              checkOrganizationName(obj["name"]);
            } catch (err) {
              cb(err.toString());
              return;
            }
            const id = await db.nameToAccountOrOrganization(obj["name"]);
            if (id != null && id != account_id) {
              cb(
                `name "${obj["name"]}" is already taken by another organization or account`
              );
              return;
            }
          }

          // Hook to truncate some text fields to at most 254 characters, to avoid
          // further trouble down the line.
          for (const field of ["title", "description", "email_address"]) {
            if (obj[field] != null) {
              obj[field] = obj[field].slice(0, 254);
            }
          }
          cb();
        },
      },
    },
  },
});
