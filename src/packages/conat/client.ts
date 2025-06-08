/*
DEVELOPMENT:

~/cocalc/src/packages/backend$ node
> require('@cocalc/backend/conat'); c = require('@cocalc/conat/client').getClient()
> c.state
'connected'
*/

import { init } from "./time";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

interface Client {
  conat: (opts?) => Promise<ConatClient>;
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
  silly: () => {},
} as Logger;

export class ClientWithState extends EventEmitter {
  conatClient?: ConatClient;
  account_id?: string;
  project_id?: string;
  compute_server_id?: number;
  state: State = "disconnected";
  _getLogger?: (name) => Logger;
  _reconnect?: () => Promise<void>;
  conat: () => Promise<ConatClient>;

  constructor(client: Client) {
    super();
    // many things potentially listen for these events -- way more than 10 things.
    this.setMaxListeners(100);
    // this.conat only ever returns *ONE* connection
    this.conat = reuseInFlight(async () => {
      if (this.state == "closed") {
        throw Error("client already closed");
      }
      if (this.conatClient) {
        return this.conatClient;
      }
      this.conatClient = await client.conat();
      return this.conatClient;
    });
    this.account_id = client.account_id;
    this.project_id = client.project_id;
    this.compute_server_id = client.compute_server_id;
    this._getLogger = client.getLogger;
    this._reconnect = client.reconnect;
  }

  numSubscriptions = () => {
    this.conatClient?.numSubscriptions() ?? 0;
  };

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
    this.conatClient?.close();
    this.setConnectionState("closed");
    this.removeAllListeners();
    delete this.conatClient;
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

// do NOT do this until some explicit use of conat is initiated, since we shouldn't
// connect to conat until something tries to do so.
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

export const conat: () => Promise<ConatClient> = reuseInFlight(async () => {
  if (globalClient == null) {
    throw Error("must set the global Conat client");
  }
  initTime();
  return await globalClient.conat();
});

export function getClient(): ClientWithState {
  if (globalClient == null) {
    throw Error("must set the global Conat client");
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
  for (const s of ["debug", "info", "warn", "silly"]) {
    logger[s] = tmpLogger(s, name, logger);
  }
  logger.silly = logger.debug;
  return logger;
}

export function numSubscriptions(): number {
  return globalClient?.numSubscriptions() ?? 0;
}
