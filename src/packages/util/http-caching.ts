/*
Helper functions for caching static files when using express
*/

import ms from "ms";

// Used for longterm caching of files. This should be in units of seconds.
const MAX_AGE = Math.round(ms("10 days") / 1000);
const SHORT_AGE = Math.round(ms("10 seconds") / 1000);

export function cacheShortTerm(res) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${SHORT_AGE}, must-revalidate`,
  );
  res.setHeader(
    "Expires",
    new Date(Date.now().valueOf() + SHORT_AGE).toUTCString(),
  );
}

// Various files such as the webpack static content should be cached long-term,
// and we use this function to set appropriate headers at various points below.
export function cacheLongTerm(res) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${MAX_AGE}, must-revalidate'`,
  );
  res.setHeader(
    "Expires",
    new Date(Date.now().valueOf() + MAX_AGE).toUTCString(),
  );
}
