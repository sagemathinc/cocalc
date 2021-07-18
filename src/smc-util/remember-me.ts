/*
We set a flag in localStorage so the client UI knows
whether or not the client should behave as if we're
signed in.  This takes into account the basePath.

This used to be done using a non-HTTP insecure cookie.
However, this information is NOT used by the backend
at all, so it is silly to store it in a cookie, since
it wastes bandwidth and makes things slower.

NOTE: We used to have an expiration for this cookie, but
that makes no sense, because it is randomly related to the
real expiration!  Anyways, if the user actually isn't signed
in, but they *were* signed in, then they still get sent
to UI/session they had, but are prompted to re-authenticate.
This is for usability: After a sign in we "mark" this client
as being "known", so next time the top landing page or
sign in page visited, we can just redirect the user
appropriately.
*/

import {
  set_local_storage,
  get_local_storage,
  delete_local_storage,
} from "./misc";

function name(basePath: string) {
  // we normalize the basePath by removing the leading slash if there
  // is one, so any definition of basePath gives same result.
  if (basePath[0] === "/") {
    basePath = basePath.slice(1);
  }
  return "remember_me" + basePath;
}

export function setRememberMe(basePath: string): void {
  set_local_storage(name(basePath), "true");
}

export function deleteRememberMe(basePath: string): void {
  delete_local_storage(name(basePath));
}

export function hasRememberMe(basePath: string): boolean {
  return get_local_storage(name(basePath)) == "true";
}
