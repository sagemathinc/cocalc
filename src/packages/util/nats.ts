// Some very generic nats related parameters

// how frequently
export const NATS_OPEN_FILE_TOUCH_INTERVAL = 30000;

export const CONNECT_OPTIONS = {
  // this pingInterval determines how long (worse case) from when the connection dies
  // and comes back, until nats starts working again.
  pingInterval: 7500,
  reconnectTimeWait: 750,
  // never give up attempting to reconnect.  The default is 10 attempts, but if we allow for
  // giving up, then we have to write logic throughout our code to do basically the same
  // thing as this, but worse.
  maxReconnectAttempts: -1,
} as const;
