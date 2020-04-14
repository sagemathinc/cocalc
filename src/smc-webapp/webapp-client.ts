//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2014 -- 2016, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

//###########################################
// connection to back-end hub
//###########################################

import { handle_hash_url } from "./client/handle-hash-url";

// The following interface obviously needs to get completed,
// and then of course all of webapp client itself needs to
// be rewritten in Typescript.  In the meantime, this might
// at least prevent a typo.  When something you need from the
// actual webapp client isn't here, add it (there api is huge).

import { EventEmitter } from "events";

import { StripeClient } from "./client/stripe";
import { ProjectCollaborators } from "./client/project-collaborators";
import { SupportTickets } from "./client/support";
import { QueryClient } from "./client/query";
import { TimeClient } from "./client/time";
import { AccountClient } from "./client/account";
import { ProjectClient } from "./client/project";
import { AdminClient } from "./client/admin";
import { UsersClient } from "./client/users";

export interface WebappClient extends EventEmitter {
  stripe: StripeClient;
  project_collaborators: ProjectCollaborators;
  support_tickets: SupportTickets;
  query_client: QueryClient;
  time_client: TimeClient;
  account_client: AccountClient;
  project_client: ProjectClient;
  admin_client: AdminClient;
  users_client: UsersClient;

  server_time: Function;
  sync_db2: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  remember_me_key: () => string;
  synctable_project: Function;
  project_websocket: Function;
  prettier: Function;
  sync_string: Function;
  sync_db: Function;
  query: Function;
  exec: Function; // TODO: rewrite project_actions.ts to not use this at all.
  touch_project: Function;
  log_error: (any) => void;
}

export let webapp_client: WebappClient;

if (
  typeof window !== "undefined" &&
  window !== null &&
  window.location != null
) {
  // We are running in a web browser (not somewhere else).

  // Set base url
  if (window.app_base_url == null) {
    window.app_base_url = "";
  }

  handle_hash_url();

  const client_browser = require("./client_browser");
  webapp_client = client_browser.connect() as WebappClient;
} else {
  webapp_client = ({} as unknown) as WebappClient; // will never get used in this case...
}
