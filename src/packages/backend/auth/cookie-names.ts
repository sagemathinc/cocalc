/*
We prefix the cookie with the base path so that it's possible to
have multiple distinct cocalc servers running on the same domain
without them colliding.
*/

import basePath from "@cocalc/backend/base-path";

// Name of user provided remember_me cookie -- this is http-only and gets set
// when the user is signed in.
export const REMEMBER_ME_COOKIE_NAME = `${
  basePath.length <= 1 ? "" : encodeURIComponent(basePath)
}remember_me`;

// Name of user provided api key cookie, with appropriate base path.
// This is set by the user when using the api from node.js, especially
// via a websocket.
export const API_COOKIE_NAME = `${
  basePath.length <= 1 ? "" : encodeURIComponent(basePath)
}api_key`;
