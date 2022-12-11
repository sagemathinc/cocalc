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
      desc: "When the person was created.",
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
    // https://stackoverflow.com/questions/13837258/what-is-an-appropriate-data-type-to-store-a-timezone
    timezone: {
      type: "string",
      desc: "The person's time zone, e.g., 'Europe/Paris' or 'US/Pacific'.",
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
    timezone: {
      type: "string",
      desc: "The organizations's time zone, e.g., 'Europe/Paris' or 'US/Pacific'.",
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
          id: true,
          created: true,
          last_edited: true,
          name: true,
          people_ids: true,
          organization_ids: true,
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
  name: "crm_support_ticket",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this support ticket.",
      pg_type: "SERIAL UNIQUE",
      noCoerce: true,
    },
    created: {
      type: "timestamp",
      desc: "When the support ticket was created.",
    },
    last_edited: {
      type: "timestamp",
      desc: "When this ticket was last changed in some way.",
    },
    assignees: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Zero or more support people that will resolve this ticket.",
    },
    cc: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Zero or more support people that care to be contacted about updates to this ticket.",
    },
    tags: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "Tags applied to this ticket.",
    },
    type: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The type of this ticket, e.g., question, incident, problem, task, etc.",
    },
    priority: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The priority of this ticket, e.g., low, normal, high, urgent",
    },
    status: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The status of this ticket, e.g., new, open, pending, solved.",
    },
  },
  rules: {
    desc: "Support Tickets",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          created: null,
          last_edited: null,
          assignees: null,
          cc: null,
          tags: null,
          type: null,
          priority: null,
          status: null,
        },
        options: [{ limit: 100 }],
      },
      set: {
        admin: true,
        fields: {
          id: true,
          created: true,
          last_edited: true,
          assignees: true,
          cc: true,
          tags: true,
          type: true,
          priority: true,
          status: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

Table({
  name: "crm_support_message",
  fields: {
    id: {
      type: "integer",
      desc: "Automatically generated sequential id that uniquely determines this message.",
      pg_type: "SERIAL UNIQUE",
      noCoerce: true,
    },
    ticket_id: {
      type: "integer",
      desc: "Support ticket id that this message is connected to.",
    },
    created: {
      type: "timestamp",
      desc: "When the message was created.  (We may save periodically before actually marking it sent.)",
    },
    last_edited: {
      type: "timestamp",
      desc: "When this message was actually sent.",
    },
    from: {
      type: "integer",
      desc: "Person that sent this message.  This in the crm_people table, not a cocalc account.",
    },
    body: {
      type: "string",
      desc: "Actual content of the message.  This is interpretted as markdown.",
    },
    internal: {
      type: "boolean",
      desc: "If true, the message is internal and only visible to support staff.",
    },
  },
  rules: {
    desc: "Support Message",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          ticket_id: null,
          created: null,
          last_edited: null,
          from: null,
          body: null,
          internal: null,
        },
        options: [{ limit: 100 }],
      },
      set: {
        admin: true,
        fields: {
          id: true,
          ticket_id: null,
          created: true,
          last_edited: true,
          from: true,
          body: true,
          internal: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});
