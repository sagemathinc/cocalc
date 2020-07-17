/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, Store } from "../app-framework";
import { SupportState } from "./types";

export class SupportStore extends Store<SupportState> {
  // nothing
}

const DEFAULT_STATE: SupportState = {
  show: false,
  url: "",
  email: "",
  subject: "",
  body: "",
  email_err: "",
  valid: false,
  status: "new",
} as const;

export const store = redux.createStore("support", SupportStore, DEFAULT_STATE);
