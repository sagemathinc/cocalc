export const SERVICE = "changefeeds";
export const SUBJECT = "changefeeds.*";

// This is the max *per account* connected to a single server, just
// because everything should have limits.
// If the user refreshes their browser, it is still about a minute
// before all the changefeeds they had open are free (due to the
// SERVER_KEEPALIVE time below).
export const MAX_PER_ACCOUNT = 500;
export const MAX_GLOBAL = 10000;

const DEBUG_DEVEL_MODE = false;

export let CLIENT_KEEPALIVE = 90000;
export let SERVER_KEEPALIVE = 45000;
export let KEEPALIVE_TIMEOUT = 10000;

if (DEBUG_DEVEL_MODE) {
  console.log(
    "*** WARNING: Using DEBUB_DEVEL_MODE changefeed parameters!! ***",
  );
  CLIENT_KEEPALIVE = 6000;
  SERVER_KEEPALIVE = 3000;
  KEEPALIVE_TIMEOUT = 1000;
}

export const RESOURCE = "PostgreSQL changefeeds";
