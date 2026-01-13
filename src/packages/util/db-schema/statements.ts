import { Table } from "./types";
import { ID } from "./crm";
import { SCHEMA as schema } from "./index";
import { NOTES } from "./crm";
import type { MoneyValue } from "@cocalc/util/money";

export type Interval = "day" | "month";

export interface Statement {
  id: number;
  interval: Interval;
  account_id: string;
  time: Date;
  balance: MoneyValue;
  total_charges: MoneyValue;
  num_charges: number;
  total_credits: MoneyValue;
  num_credits: number;
  last_sent?: Date;
  // If an automatic payment was created to pay for this statement, then
  // automatic_payment_intent_id is the id of that payment intent.  When the
  // payment is processed, the resulting purchase_id is set in the
  // field paid_purchase_id.
  automatic_payment_intent_id?: string;
  automatic_payment?: Date;
  // If this statement has been paid, this is the purchase_id of the credit that paid it.
  // A payment is required exactly if the balance is negative.
  paid_purchase_id?: number;
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
      pg_type: "numeric(20,10)",
    },
    total_charges: {
      title: "Total Charges (USD $)",
      desc: "The total of all positive charges for purchases that are part of this statement",
      type: "number",
      pg_type: "numeric(20,10)",
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
      pg_type: "numeric(20,10)",
    },
    num_credits: {
      title: "Number of Credits",
      desc: "The number of negative charges for purchases that are part of this statement",
      type: "integer",
    },
    paid_purchase_id: {
      title: "Paid -- purchase id",
      desc: "Transaction id (in purchases table) of the credit that paid off the statement balance.",
      type: "integer",
    },
    automatic_payment: {
      title: "Automatic Payment Time",
      type: "timestamp",
      desc: "If an automatic payment was attempted at all for this statement (and any subscriptions that will soon renew), then this the timestamp of that attempt.  Only one attempt to make a paymentIntent ever happens automatically.",
    },

    automatic_payment_intent_id: {
      title: "Automatic Payment",
      type: "string",
      desc: "If an automatic payment was issued for this statement, then this is the id of the payment intent.   This is only used for monthly statements when the balance is NEGATIVE. If this is issued and the user successfully pays it, then when the payment is processed the paid_purchase_id field above will get set.",
    },
    last_sent: {
      type: "timestamp",
      desc: "Timestamp we last tried to send this statmenet (via email) to the user.  NOTE: we always try to send monthly statements.  We try to send daily statements depending on account prefs.",
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
          automatic_payment_intent_id: null,
          automatic_payment: null,
          last_sent: null,
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
          automatic_payment_intent_id: null,
          automatic_payment: null,
          notes: null,
          last_sent: null,
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

/*
NOTES

What's a statement?

- id - numerical
- account_id -- of the user
- time -- when statement created; will be midnight UTC for a given day.
- balance -- current running balance up to exact time of statement, which is by definition sum of all purchase costs ever
- total_charges -- sum of debits during the statement period (a non-positive number)
- num_charges
- total_credits -- sum of the credits during the statement period (a non-negative number)
- num_credits

A statement contains by definition every transaction with time <= created that is not on some existing monthly or daily statement.

We make the statement by doing a query for every purchase with timestamp <= cutoff time and daily_statement_id (or monthly_statement_id) not set.  This ensures that even if a statement were somehow missed one day, it would be included the next day.

- compute total_charges/num_charges and total_credits/num_credits directly via a query
- compute balance from total_charges, total_credits and the balance number off the previous statement (if there is one).

The transactions that correspond to a statement are in the database and can be queried easily.

We make statements for each account for which there is at least one purchase that isn't associated to a statement.
Thus if there is no statement at a point in time for a given account, then there shouldn't be any purchases.

For pay as you go purchases, the purchase isn't included in a statement until the cost is set (i.e., when
the purchase is finalized).  So if the purchase starts on day 1 and ends on day 2, it goes on the day 2
statement.

IMPORTANT: I did NOT make the pair (account_id, time) in the statements table uniq.  If somehow a new
purchase were created that was in the same time period as an existing statement (which should never happen,
but who knows - maybe there is a bug or a clock is off in the database (?)), then we will end up with
two valid statements with the same date. There's no overlap between them in terms of the numbers or counts,
and they just represent different purchases.
*/
