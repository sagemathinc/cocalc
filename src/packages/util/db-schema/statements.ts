import { Table } from "./types";
import { ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";

export type Interval = "day" | "month";

export interface Statement {
  id: number;
  interval: Interval;
  account_id: string;
  time: Date;
  balance: number;
  total_charges: number;
  num_charges: number;
  total_credits: number;
  num_credits: number;
}

Table({
  name: "statements",
  fields: {
    id: ID,
    interval: {
      title: "Interval",
      type: "string",
      desc: "The length of time of one interval of the statmenet: 'day' or 'month', meaning statement (typically) covers all purchases from the previous day or month.",
    },
    account_id: {
      type: "uuid",
      desc: "Account.",
      render: { type: "account" },
    },
    time: {
      type: "timestamp",
      desc: "Statemnet cutoff time.  This statement contains exactly the purchases up to this time that are not on any other statement with the same interval.",
    },
    balance: {
      title: "Balance (USD $)",
      desc: "The balance in US dollars of the user's account at this point in time.",
      type: "number",
      pg_type: "real",
    },
    total_charges: {
      title: "Total Charges (USD $)",
      desc: "The total of all positive charges for purchases that are part of this statement",
      type: "number",
      pg_type: "real",
    },
    num_charges: {
      title: "Number of Charges",
      desc: "The number of positive charges for purchases that are part of this statement",
      type: "integer",
    },
    total_credits: {
      title: "Total Credits (USD $)",
      desc: "The total of all negative charges for purchases that are part of this statement",
      type: "number",
      pg_type: "real",
    },
    num_credits: {
      title: "Number of Credits",
      desc: "The number of negative charges for purchases that are part of this statement",
      type: "integer",
    },
    notes: NOTES, // for admins to make notes about this statement
  },
  rules: {
    desc: "Statements",
    primary_key: "id",
    pg_indexes: ["account_id"],
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          id: null,
          interval: null,
          account_id: null,
          time: null,
          balance: null,
          total_charges: null,
          num_charges: null,
          total_credits: null,
          num_credits: null,
        },
      },
    },
  },
});

Table({
  name: "crm_statements",
  rules: {
    virtual: "statements",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          interval: null,
          account_id: null,
          time: null,
          balance: null,
          total_charges: null,
          num_charges: null,
          total_credits: null,
          num_credits: null,
          notes: null,
        },
      },
      set: {
        // can ONLY set the notes field; statements should never get edited otherwise!
        admin: true,
        fields: {
          id: true,
          notes: true,
        },
      },
    },
  },
  fields: schema.statements.fields,
});
