/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
import { TypedMap } from "../app-framework";

export interface Ticket {
  created_at: Date;
  updated_at: Date; // iso date string
  id: number;
  status: string;
  description: string;
}

export type Status =
  | "new" // new/default/resetted/no problem
  | "creating" // loading ...
  | "created" // ticket created
  | "error"; //there was a problem

export type Tags = "member" | "free" | "upgraded" | "student";

export interface SupportState {
  // First part is modal support dialog that pops up
  show: boolean;
  email: string;
  subject: string;
  body: string;
  url: string;
  email_err: string;
  err?: Error;
  valid: boolean; // valid means "ready to submit"
  status: Status;
  project_title?: string;

  // This is for the list of existing support tickets page
  // (todo: should be an entirely different store?)
  support_ticket_error?: Error;
  support_tickets?: List<TypedMap<Ticket>>;
}
