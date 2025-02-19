import type { NatsEnv, NatsEnvFunction } from "@cocalc/nats/types";

interface Client {
  getNatsEnv: NatsEnvFunction;
}

let globalClient: null | Client = null;
export function setNatsClient(client: Client) {
  globalClient = client;
}

export async function getEnv(): Promise<NatsEnv> {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  return await globalClient.getNatsEnv();
}
