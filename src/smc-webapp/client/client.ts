import { EventEmitter } from "events";

export type AsyncCall = (opts: object) => Promise<any>;

import { StripeClient } from "./stripe";
import { ProjectCollaborators } from "./project-collaborators";
import { SupportTickets } from "./support";
import { QueryClient } from "./query";
import { TimeClient } from "./time";
import { AccountClient } from "./account";
import { ProjectClient } from "./project";
import { AdminClient } from "./admin";
import { UsersClient } from "./users";

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
  touch_project: (project_id: string) => Promise<void>;
  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
}
