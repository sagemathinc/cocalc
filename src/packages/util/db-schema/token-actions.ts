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
import type { LineItem } from "@cocalc/util/stripe/types";

interface CancelSubscription {
  type: "cancel-subscription";
  subscription_id: number;
}

interface Error {
  type: "error";
}

export interface MakePayment {
  type: "make-payment";
  account_id: string; // account in which to put the money
  amount: number; // amount of credit to create
  reason: string; // description of why making the payment
  paid?: number; // time in ms since epoch when payment completed
}

interface DisableDailyStatements {
  type: "disable-daily-statements";
  account_id: string;
}

export interface StudentPay {
  type: "student-pay";
  account_id: string;
  project_id: string;
  // STEP 0:
  // If payment hasn't happened yet, this is the information needed to use
  // the StripePayment component to do the payment, and also ensure the
  // payment processing records the course fee purchase for the student project.
  payment?: {
    lineItems: LineItem[];
    description: string;
    metadata: object;
    purpose: string;
  };
  // STEP 1: if payment started, then this will be set
  paymentIntentId?: string;
  // STEP 2: time in ms since epoch when payment completed
  paid?: number;
}

export type Description =
  | Error
  | CancelSubscription
  | MakePayment
  | DisableDailyStatements
  | StudentPay;

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
