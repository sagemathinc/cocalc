/*
DEVELOPMENT:

~/cocalc/src/packages/backend$ node
> require('@cocalc/backend/nats'); c = require('@cocalc/nats/client').getClient()
> c.state
'connected'
> Object.keys(await c.getNatsEnv())
[ 'nc', 'jc' ]
*/

import type { NatsEnv, NatsEnvFunction } from "@cocalc/nats/types";
import { init } from "./time";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { NatsConnection } from "@nats-io/nats-core";

interface Client {
  getNatsEnv: NatsEnvFunction;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
}

type State = "closed" | "connected" | "connecting" | "disconnected";

export class ClientWithState extends EventEmitter {
  getNatsEnv: NatsEnvFunction;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
  state: State = "disconnected";
  env?: NatsEnv;

  constructor(client: Client) {
    super();
    // many things listen for these events -- way more than 10 things.
    this.setMaxListeners(500);
    this.getNatsEnv = reuseInFlight(async () => {
      if (this.state == "closed") {
        throw Error("client already closed");
      }
      if (this.env) {
        return this.env;
      }
      this.env = await client.getNatsEnv();
      this.monitorConnectionState(this.env.nc);
      return this.env;
    });
    this.account_id = client.account_id;
    this.project_id = client.project_id;
    this.compute_server_id = client.compute_server_id;
  }

  close = () => {
    this.env?.nc.close();
    this.setConnectionState("closed");
    this.removeAllListeners();
    delete this.env;
  };

  private setConnectionState = (state: State) => {
    if (state == this.state) {
      return;
    }
    this.state = state;
    this.emit(state);
    this.emit("state", state);
  };

  private monitorConnectionState = async (nc) => {
    this.setConnectionState("connected");

    for await (const { type } of nc.status()) {
      if (this.state == "closed") {
        return;
      }
      if (type.includes("ping") || type == "update" || type == "reconnect") {
        // connection is working well
        this.setConnectionState("connected");
      } else if (type == "reconnecting") {
        this.setConnectionState("connecting");
      }
    }
  };
}

// do NOT do this until some explicit use of nats is initiated, since we shouldn't
// connect to nats until something tries to do so.
let timeInitialized = false;
function initTime() {
  if (timeInitialized) {
    return;
  }
  timeInitialized = true;
  init();
}

let globalClient: null | ClientWithState = null;
export function setNatsClient(client: Client) {
  globalClient = new ClientWithState(client);
}

export async function getEnv(): Promise<NatsEnv> {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  initTime();
  return await globalClient.getNatsEnv();
}

export function getClient(): ClientWithState {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  initTime();
  return globalClient;
}

export async function getConnection(): Promise<NatsConnection> {
  const { nc } = await getEnv();
  return nc;
}
