export const SERVICE = "changefeeds";
export const SUBJECT = "changefeeds.*";

// This is the max *per account* connected to a single server, just
// because everything should have limits.
// If the user refreshes their browser, it is still about a minute
// before those changefeeds they had open freed (due to the
// keepalive times below).
export const MAX_PER_ACCOUNT = 500;
export const MAX_GLOBAL = 5000;

export const CLIENT_KEEPALIVE = 90000;
export const SERVER_KEEPALIVE = 45000;
export const KEEPALIVE_TIMEOUT = 10000;

export const RESOURCE = "PostgreSQL changefeeds";
