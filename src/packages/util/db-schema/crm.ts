/*
NOTES:

- right now the Table function types.ts also automatically does some
extra things for all crm_ tables to ensure safety, e.g., ensuring admin.

- do NOT use defaults for get.fields!  Those are set by the frontend crm code when creating records.
  Also, they are not compatible with null-ing fields.

*/

import { FieldSpec, Table } from "./types";
import { blue, green, red, yellow } from "@ant-design/colors";

export const NOTES: FieldSpec = {
  type: "string",
  desc: "Open ended text in markdown about this item.",
  render: {
    type: "markdown",
    editable: true,
  },
} as const;

export const ID: FieldSpec = {
  type: "integer",
  desc: "Automatically generated sequential id that uniquely determines this row.",
  pg_type: "SERIAL UNIQUE",
  noCoerce: true,
} as const;

const TAG_TYPE = `INTEGER[]`;

const TAGS_FIELD: FieldSpec = {
  type: "array",
  pg_type: TAG_TYPE,
  desc: "Tags applied to this record.",
  render: { type: "tags", editable: true },
} as const;

const PRORITIES_FIELD: FieldSpec = {
  type: "string",
  pg_type: "VARCHAR(30)",
  desc: "Priority of this record",
  render: {
    type: "select",
    editable: true,
    options: ["low", "normal", "high", "urgent"],
    colors: [yellow[5], blue[5], green[5], red[5]],
    priority: true,
  },
} as const;

const STATUS_FIELD: FieldSpec = {
  type: "string",
  pg_type: "VARCHAR(30)",
  desc: "Status of this record",
  render: {
    type: "select",
    editable: true,
    options: ["new", "open", "pending", "active", "solved"],
    colors: [yellow[5], red[5], green[5], blue[5], "#888"],
  },
} as const;

export const CREATED: FieldSpec = {
  type: "timestamp",
  desc: "When the record was created.",
} as const;

export const LAST_EDITED: FieldSpec = {
  type: "timestamp",
  desc: "When this record was last edited.",
} as const;

const LAST_MODIFIED_BY: FieldSpec = {
  type: "uuid",
  desc: "Account that last modified this task.",
  render: { type: "account" },
} as const;

const ASSIGNEE: FieldSpec = {
  type: "uuid",
  desc: "Account that is responsible for resolving this.",
  render: {
    type: "assignee",
    editable: true,
  },
} as const;

Table({
  name: "crm_people",
  fields: {
    id: ID,
    created: CREATED,
    last_edited: LAST_EDITED,
    name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The name of this person.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    email_addresses: {
      type: "array",
      pg_type: "VARCHAR(1000)",
      desc: "Email addresses for this person, separated by commas",
      render: {
        type: "text",
        maxLength: 1000,
        editable: true,
      },
    },
    account_ids: {
      title: "Accounts",
      type: "array",
      pg_type: "UUID[]",
      desc: "Array of 0 or more uuid's of CoCalc accounts that this person may have.",
      render: {
        type: "accounts",
        editable: true,
      },
    },
    deleted: {
      type: "boolean",
      desc: "True if the person has been deleted.",
    },
    notes: NOTES,
    // https://stackoverflow.com/questions/13837258/what-is-an-appropriate-data-type-to-store-a-timezone
    timezone: {
      type: "string",
      desc: "The person's time zone, e.g., 'Europe/Paris' or 'US/Pacific'.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    tags: TAGS_FIELD,
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
          tags: null,
        },
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
          tags: null,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

const ORGANIZATIONS = {
  type: "array",
  pg_type: "INTEGER[]",
  desc: "Zero or more organizations in the Organizations table",
  render: {
    type: "organizations",
    editable: true,
  },
} as FieldSpec;

export const CREATED_BY = {
  type: "uuid",
  desc: "Account that created this record.",
  render: { type: "account" },
} as FieldSpec;

const PERSON = {
  type: "integer",
  desc: "One person in the People table",
  render: {
    type: "person",
    editable: true,
  },
} as FieldSpec;

const PEOPLE = {
  type: "array",
  pg_type: "INTEGER[]",
  desc: "Array of 0 or more people in the People table that are connected with this",
  render: {
    type: "people",
    editable: true,
  },
} as FieldSpec;

// TODO: add image -- probably want to use blob table (?) but maybe do like with projects. Not sure.
Table({
  name: "crm_organizations",
  fields: {
    id: ID,
    created: CREATED,
    last_edited: LAST_EDITED,
    name: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "The name of this organization.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    people: PEOPLE,
    organizations: {
      title: "Related Organizations",
      type: "array",
      pg_type: "INTEGER[]",
      desc: "Array of 0 or more organization that are connected with this organization",
      render: {
        type: "organizations",
        editable: true,
      },
    },
    deleted: {
      type: "boolean",
      desc: "True if this org has been deleted.",
    },
    notes: NOTES,
    timezone: {
      type: "string",
      desc: "The organizations's time zone, e.g., 'Europe/Paris' or 'US/Pacific'.",
      render: {
        type: "text",
        editable: true,
      },
    },
    domain: {
      type: "string",
      pg_type: "VARCHAR(254)", // todo -- should this be an array of domain names?
      desc: "Domain name of this org, e.g., math.washington.edu.",
      render: {
        type: "text",
        editable: true,
        maxLength: 254,
      },
    },
    tags: TAGS_FIELD,
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
          people: null,
          organizations: null,
          deleted: null,
          notes: null,
          domain: null,
          tags: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          created: true,
          last_edited: true,
          name: true,
          people: true,
          organizations: true,
          deleted: true,
          notes: true,
          domain: true,
          tags: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

Table({
  name: "crm_support_tickets",
  fields: {
    id: ID,
    subject: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Subject of the message. Must be short.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    created: CREATED,
    created_by: PERSON,
    last_edited: LAST_EDITED,
    last_modified_by: LAST_MODIFIED_BY,
    assignee: ASSIGNEE,
    tasks: {
      title: "Tasks",
      type: "array",
      pg_type: "integer[]",
      desc: "Tasks associated with this support ticket.",
    },
    cc: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Zero or more support accounts that care to be contacted about updates to this ticket.",
    },
    tags: TAGS_FIELD,
    priority: PRORITIES_FIELD,
    status: STATUS_FIELD,
    type: {
      type: "string",
      pg_type: "VARCHAR(30)",
      desc: "The type of this ticket: question, incident, problem, task, etc.",
      render: { type: "text", editable: true, maxLength: 30 },
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
          subject: null,
          created: null,
          created_by: null,
          last_edited: null,
          last_modified_by: null,
          assignee: null,
          tasks: null,
          cc: null,
          tags: null,
          type: null,
          priority: null,
          status: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          subject: true,
          created: true,
          last_edited: true,
          last_modified_by: true,
          created_by: true,
          assignee: true,
          tasks: true,
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
  name: "crm_support_messages",
  fields: {
    id: ID,
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
    sent_by: PERSON,
    body: {
      type: "string",
      desc: "Actual content of the message.  This is interpretted as markdown.",
      render: {
        type: "markdown",
        editable: true,
        maxLength: 20000,
      },
    },
    internal: {
      type: "boolean",
      desc: "If true, the message is internal and only visible to support staff.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
  },
  rules: {
    desc: "Support Messages",
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
          sent_by: null,
          body: null,
          internal: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          ticket_id: true,
          created: true,
          last_edited: true,
          sent_by: true,
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

Table({
  name: "crm_tasks",
  fields: {
    id: ID,
    subject: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Short summary of this tasks.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    due_date: {
      title: "Due",
      type: "timestamp",
      desc: "When this task is due.",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    created: CREATED,
    last_edited: LAST_EDITED,
    closed: {
      type: "timestamp",
      title: "When closed",
      desc: "When the task was marked as done.",
      render: {
        type: "timestamp",
        editable: false,
      },
    },
    done: {
      type: "boolean",
      desc: "The task is done.",
      render: {
        type: "boolean",
        editable: true,
        whenField: "closed",
      },
    },
    status: STATUS_FIELD,
    progress: {
      type: "integer",
      desc: "Progress on this task, as a number from 0 to 100.",
      render: {
        type: "percent",
        editable: true,
        steps: 5,
      },
    },
    priority: PRORITIES_FIELD,
    support_ticket: {
      type: "integer",
      desc: "Support ticket that this task is connected to, if any.",
    },
    people: PEOPLE,
    organizations: ORGANIZATIONS,
    created_by: CREATED_BY,
    last_modified_by: LAST_MODIFIED_BY,
    assignee: ASSIGNEE,
    cc: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Zero or more accounts that care to be contacted/notified about updates to this task.",
    },
    tags: TAGS_FIELD,
    description: {
      type: "string",
      desc: "Full markdown task description",
      render: {
        type: "markdown",
        editable: true,
      },
    },
  },
  rules: {
    desc: "Tasks",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          subject: null,
          due_date: null,
          created: null,
          done: null,
          closed: null,
          last_edited: null,
          status: null,
          progress: null,
          priority: null,
          people: null,
          organizations: null,
          support_ticket: null,
          created_by: null,
          last_modified_by: null,
          assignee: null,
          cc: null,
          tags: null,
          description: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          subject: true,
          due_date: true,
          created: true,
          done: true,
          closed: true,
          last_edited: true,
          status: true,
          progress: true,
          priority: true,
          people: true,
          organizations: null,
          support_ticket: true,
          created_by: true,
          last_modified_by: true,
          assignee: true,
          cc: true,
          tags: true,
          description: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

// Table of all hashtags across our crm system.  Note that these settings
// are very global.  We may later make a similar table that is scoped to
// a project, file, user, etc...
Table({
  name: "crm_tags",
  fields: {
    id: ID,
    name: {
      title: "Tag",
      type: "string",
      desc: "The name of the tag.",
      pg_type: "VARCHAR(30)",
      render: { type: "text", editable: true, maxLength: 30, tag: true },
      unique: true,
    },
    icon: {
      type: "string",
      desc: "Name of icon to show with tag",
      pg_type: "VARCHAR(100)", // ???
      render: { type: "icon", editable: true },
    },
    description: {
      type: "string",
      desc: "Description of the tag.",
      pg_type: "VARCHAR(254)",
      render: { type: "markdown", editable: true },
    },
    color: {
      type: "string",
      desc: "color",
      pg_type: "VARCHAR(30)",
      render: { type: "color", editable: true },
    },
    notes: NOTES,
    created: CREATED,
    last_edited: LAST_EDITED,
    last_modified_by: LAST_MODIFIED_BY,
  },
  rules: {
    desc: "Table of all tags across our crm system.",
    primary_key: "id",
    user_query: {
      get: {
        admin: true,
        pg_where: [],
        fields: {
          id: null,
          name: null,
          icon: null,
          description: null,
          notes: null,
          color: null,
          created: null,
          last_edited: null,
          last_modified_by: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          name: true,
          icon: true,
          description: true,
          notes: true,
          color: true,
          created: true,
          last_edited: true,
          last_modified_by: true,
        },
        required_fields: {
          last_edited: true, // TODO: make automatic on any set query
        },
      },
    },
  },
});

Table({
  name: "crm_leads",
  fields: {
    id: ID,
    created: CREATED,
    last_edited: LAST_EDITED,
    people: PEOPLE,
    deleted: {
      type: "boolean",
      desc: "True if the lead has been deleted.",
    },
    notes: {
      type: "string",
      desc: "Open ended text in markdown about this lead.",
      render: { type: "markdown", editable: true },
    },
    assignee: ASSIGNEE,
    tags: TAGS_FIELD,
    status: {
      type: "string",
      pg_type: "VARCHAR(30)",
      desc: "Status of this lead",
      render: {
        type: "select",
        editable: true,
        options: [
          "Contact in Future",
          "Attempted to Contact",
          "Contacted",
          "Junk Lead",
          "Lost Lead",
          "Not Contacted",
          "Pre Qualified",
          "Not Qualified",
        ],
        colors: [
          yellow[5],
          green[4],
          green[5],
          red[5],
          red[6],
          yellow[5],
          blue[5],
          blue[6],
        ],
      },
    },
    rating: {
      type: "string",
      pg_type: "VARCHAR(30)",
      desc: "Rating of this lead",
      render: {
        type: "select",
        editable: true,
        priority: true,
        options: [
          "-None-",
          "Shut Down",
          "Project Canceled",
          "Market Failed",
          "Active",
          "Acquired",
        ],
        colors: [yellow[5], red[4], red[5], red[6], green[5], blue[5]],
      },
    },
    annual_revenue: {
      type: "number",
      desc: "Rough estimate of possible annual revenue that could result from this lead.",
      render: { type: "number", editable: true, format: "money", min: 0 },
    },
  },
  rules: {
    desc: "CRM Leads",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          created: null,
          last_edited: null,
          people: null,
          deleted: null,
          notes: null,
          tags: null,
          assignee: null,
          status: null,
          rating: null,
          annual_revenue: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          created: true,
          last_edited: true,
          people: true,
          deleted: true,
          notes: true,
          tags: true,
          assignee: true,
          status: true,
          rating: true,
          annual_revenue: true,
        },
        required_fields: {
          last_edited: true,
        },
      },
    },
  },
});
