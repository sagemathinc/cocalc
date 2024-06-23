/*
We import and export from here, so we can put some wrapping around these.
*/

export { z } from "zod";
import {
  apiRoute as apiRoute0,
  apiRouteOperation as apiRouteOperation0,
} from "next-rest-framework";

export function apiRoute(obj) {
  if (process.env.NODE_ENV != "production" && process.env.COCALC_DISABLE_API_VALIDATION != 'yes') {
    // this actually does all the clever validation, etc.
    return apiRoute0(obj);
  } else {
    // this IGNORES all validation etc and just uses the original handler,
    // thus completely skipping next-rest-framework.
    // NOTE: We are assuming there is at most one handler defined per route!
    // That is the case in the current codebase.  I.e., our current handler
    // function internally handles all of POST, GET, etc. in one function,
    // and apiRoute is only called with one distinct handler.
    for (const k in obj) {
      return obj[k].handler;
    }
  }
}

export { apiRouteOperation0 as apiRouteOperation };

/*
// When we want to check validation in production and log
// warnings, we'll use something based on this.

export function apiRouteOperation(obj): ReturnType<typeof apiRouteOperation0> {
  if (process.env.NODE_ENV != "production") {
    return apiRouteOperation0(obj);
  }
  // In production mode we disable all validation, since
  // we do not want to (1) slow things down, and
  // (2) break anything.
  // TODO: once things seem to work well in dev mode,
  // check validation in production and log failures
  // as WARNINGS to our database.  Only when this is stable
  // with zero errors for a while do we switch to actual
  // runtime validation.

  const x = apiRouteOperation0(obj);
  return neuterApiRouteOperation(x);
}

// The output of apiRouteOperation0 has methods:
//    input
//    outputs
//    middleware
//    handler
// which get chained together, e.g.,
//    x.input(...).outputs(...).middleware(...).handler(...)
// to define how the route is checked and handled.
// We have to fake that in such a way that input and outputs
// are ignored, but the rest work.
// The following takes
function neuterApiRouteOperation(x) {
  return {
    ...x,
    input: () => x,
    outputs: () => x,
    middleware: (...args) => {
      const y = x.middleware(...args);
      return neuterApiRouteOperation(y);
    },
    handler: (...args) => {
      const y = x.handler(...args);
      return neuterApiRouteOperation(y);
    },
  };
}
*/
