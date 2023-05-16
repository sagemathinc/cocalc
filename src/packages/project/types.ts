import type { Client } from "./client";

export interface SageSessionOpts {
  client: Client;
  path: string; // the path to the *worksheet* file
}
