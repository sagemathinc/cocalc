import { Table } from "./types";

Table({
  name: "crm_people",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this person.",
      pg_type: "SERIAL UNIQUE",
      noCoerce: true,
    },
    created: {
      type: "timestamp",
      desc: "When the account was created.",
      crm: true,
    },
    last_edited: {
      type: "timestamp",
      desc: "When this person was last edited.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The name of this person.",
    },
    email_addresses: {
      type: "array",
      pg_type: "VARCHAR(1000)",
      desc: "Email addresses for this person, separated by commas",
    },
    account_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Array of 0 or more accounts that this person may have.",
    },
    deleted: {
      type: "boolean",
      desc: "True if the person has been deleted.",
    },
    notes: {
      type: "string",
      desc: "Open ended text in markdown about this person.",
    },
  },
  rules: {
    desc: "People",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          created: null,
          last_edited: null,
          email_addresses: null,
          name: null,
          account_ids: null,
          deleted: null,
          notes: null,
        },
        options: [{ limit: 100 }],
      },
      set: {
        admin: true,
        fields: {
          id: true,
          created: true,
          last_edited: true,
          name: true,
          email_addresses: true,
          account_ids: true,
          deleted: true,
          notes: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

Table({
  name: "crm_organizations",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this organization.",
      pg_type: "SERIAL UNIQUE",
      noCoerce: true,
    },
    created: {
      type: "timestamp",
      desc: "When the account was created.",
      crm: true,
    },
    last_edited: {
      type: "timestamp",
      desc: "When this person was last edited.",
    },
    name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The first name of this organization.",
    },
    people_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Array of 0 or more people that are connected with this organization",
    },
    organization_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Array of 0 or more organization that are connected with this organization",
    },
    deleted: {
      type: "boolean",
      desc: "True if this org has been deleted.",
    },
    notes: {
      type: "string",
      desc: "Open ended text in markdown about this organization.",
    },
  },
  rules: {
    desc: "Organizations",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          created: null,
          last_edited: null,
          name: null,
          people_ids: null,
          organization_ids: null,
          deleted: null,
          notes: null,
        },
        options: [{ limit: 100 }],
      },
      set: {
        admin: true,
        fields: {
          id: null,
          created: null,
          last_edited: null,
          name: null,
          people_ids: null,
          organization_ids: null,
          deleted: null,
          notes: null,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});
