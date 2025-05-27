/*
Create a connection to a conat server authenticated as a project or compute
server, via an api key or the project secret token.
*/

import getConnection from "@cocalc/backend/conat/persistent-connection";
import { apiKey, conatServer } from "@cocalc/backend/data";
import { project_id } from "@cocalc/project/data";
import secretToken from "@cocalc/project/servers/secret-token";
import { connect } from "@cocalc/conat/core/client";
import {
  API_COOKIE_NAME,
  PROJECT_SECRET_COOKIE_NAME,
  PROJECT_ID_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";

export default getConnection;

export async function connectToConat(options?) {
  let Cookie;
  if (apiKey) {
    Cookie = `${API_COOKIE_NAME}=${apiKey}`;
  } else {
    Cookie = `${PROJECT_SECRET_COOKIE_NAME}=${await secretToken()}; ${PROJECT_ID_COOKIE_NAME}=${project_id}`;
  }
  return connect({
    address: conatServer,
    extraHeaders: { Cookie },
    ...options,
  });
}
