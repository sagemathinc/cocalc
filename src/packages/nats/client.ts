import type { NatsEnv, NatsEnvFunction } from "@cocalc/nats/types";
import { init } from "./time";

interface Client {
  getNatsEnv: NatsEnvFunction;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
}

let globalClient: null | Client = null;
export function setNatsClient(client: Client) {
  globalClient = client;
  setTimeout(init, 1);
}

export async function getEnv(): Promise<NatsEnv> {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  return await globalClient.getNatsEnv();
}

export function getClient(): Client {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  return globalClient;
}
