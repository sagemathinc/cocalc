/*
DEVELOPMENT:

~/cocalc/src/packages/backend$ node
> require('@cocalc/backend/conat'); c = require('@cocalc/conat/client').getClient()
> c.state
'connected'
> Object.keys(await c.getNatsEnv())
[ 'nc', 'jc' ]
*/

import type { NatsEnv, NatsEnvFunction } from "@cocalc/conat/types";
import { init } from "./time";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

type NatsConnection = any;

interface Client {
  getNatsEnv: NatsEnvFunction;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
  getLogger?: (name) => Logger;
  // if defined, causes a client-defined version of reconnecting.
  reconnect?: () => Promise<void>;
}

type State = "closed" | "connected" | "connecting" | "disconnected";

interface Logger {
  debug: Function;
  info: Function;
  warn: Function;
}

const FALLBACK_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
} as Logger;

export class ClientWithState extends EventEmitter {
  getNatsEnv: NatsEnvFunction;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
  state: State = "disconnected";
  env?: NatsEnv;
  _getLogger?: (name) => Logger;
  _reconnect?: () => Promise<void>;

  constructor(client: Client) {
    super();
    // many things listen for these events -- way more than 10 things.
    this.setMaxListeners(500);
    // this getNatsEnv only ever returns *ONE* connection
    this.getNatsEnv = reuseInFlight(async () => {
      if (this.state == "closed") {
        throw Error("client already closed");
      }
      if (this.env) {
        return this.env;
      }
      this.env = await client.getNatsEnv();
      return this.env;
    });
    this.account_id = client.account_id;
    this.project_id = client.project_id;
    this.compute_server_id = client.compute_server_id;
    this._getLogger = client.getLogger;
    this._reconnect = client.reconnect;
  }

  reconnect = async () => {
    await this._reconnect?.();
  };

  getLogger = (name): Logger => {
    if (this._getLogger != null) {
      return this._getLogger(name);
    } else {
      return FALLBACK_LOGGER;
    }
  };

  close = () => {
    this.env?.nc?.close();
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
export function setConatClient(client: Client) {
  globalClient = new ClientWithState(client);
}

export async function reconnect() {
  await globalClient?.reconnect();
}

export const getEnv = reuseInFlight(async () => {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  initTime();
  return await globalClient.getNatsEnv();
});

export function getClient(): ClientWithState {
  if (globalClient == null) {
    throw Error("must set the global NATS client");
  }
  initTime();
  return globalClient;
}

function tmpLogger(s, name, logger) {
  return (...args) => {
    if (globalClient == null) {
      return;
    }
    const f = globalClient.getLogger(name);
    for (const k in f) {
      logger[k] = f[k];
    }
    logger[s](...args);
  };
}

export function getLogger(name) {
  // weird code since getLogger can get called very early, before
  // globalClient is even initialized.
  try {
    if (globalClient != null) {
      return globalClient.getLogger(name);
    }
  } catch {}
  // make logger that starts working after global client is set
  const logger: any = {};
  for (const s of ["debug", "info", "warn"]) {
    logger[s] = tmpLogger(s, name, logger);
  }
  return logger;
}

// this is a singleton
let theConnection: NatsConnection | null = null;
export const getConnection = reuseInFlight(
  async (): Promise<NatsConnection> => {
    return null as any;
//     if (theConnection == null) {
//       const { nc } = await getEnv();
//       if (nc == null) {
//         throw Error("bug");
//       }
//       theConnection = nc;
//     }
//     return theConnection;
  },
);

export function getConnectionSync(): NatsConnection | null {
  return theConnection;
}

export function numSubscriptions(): number {
  if (theConnection == null) {
    return 0;
  }
  return (theConnection as any).protocol.subscriptions.subs.size;
}
