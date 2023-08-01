/*
Tokens Actions table -- these are actions associated with a token
that a user can take in response to clicking on a link,
without needing to be signed in:

- cancel a subscription for a given user
- add credit to account to pay some amount that is due
- disable emails about daily statements

And I'm sure we will have other ideas. The above all have to do
with billing and purchasing, but other actions like "accepting
a project invite" or "changing newsletter prefs" could be part of this.

The table contains these columns:

 - token: a random 20 character secret token.  It shouldn't ever be possible to
   fabricate an existing token; it should be short though.
 - description: jsonb object that describes the action
 - expire: timestamp when the action expires, e.g., 3 days

When we send a user an email with their daily statement, we
wll also generate an action for "disable daily statements", which
lets them do so with one click without having to worry about
signing in.

When we send them an email with a monthly statements, if they don't
have automatic billing setup, we send them a link that lets them
pay their bill, without having to sign in.  Also, they could forward
the link to somebody else who could pay the bill.

When we email them about subscriptions they get one link for each subscription,
which lets them cancel a subscription without having to sign in.

This above is all handled by the endpoint /token?token=... in the
nextjs application.
*/

import { Table } from "./types";
import tokenGenerator from "voucher-code-generator";

interface CancelSubscription {
  type: "cancel-subscription";
  subscription_id: number;
}

interface AddCredit {
  type: "add-credit";
  account_id: string;
}

interface DisableDailyStatements {
  type: "disable-daily-statements";
  account_id: string;
}

export type Description =
  | CancelSubscription
  | AddCredit
  | DisableDailyStatements;

export interface TokenAction {
  token: string;
  description: Description;
  expire: Date;
}

// Generate a random token
export function generateToken() {
  return tokenGenerator.generate({ length: 20, count: 1 })[0];
}

Table({
  name: "token_actions",
  fields: {
    token: {
      type: "string",
      pg_type: "char(20)",
      desc: "Random token that determines this action.",
    },
    expire: {
      type: "timestamp",
      desc: "future date, when the entry will be deleted",
    },
    description: {
      title: "Description",
      desc: "Object that describes the action (see typescript in db-schema/token-actions.ts)",
      type: "map",
      pg_type: "jsonb",
    },
  },
  rules: {
    desc: "Token Actions",
    primary_key: "token",
  },
});
