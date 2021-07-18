/*
In the interest of security and "XSS", we strip the "remember_me" cookie
from the header before passing anything along via the proxy.
The reason this is important is that it's critical that the project (and
nothing running in the project) can get access to a user's auth cookie.
I.e., malicious code running in a project shouldn't be able to steal
auth credentials for all users of a project!
*/

import { remember_me_cookie_name } from "../auth";

export default function stripRememberMeCookie(cookie): {
  cookie: string;
  remember_me: string | undefined; // the value of the cookie we just stripped out.
} {
  if (cookie == null) {
    return { cookie, remember_me: undefined };
  } else {
    const v : string[] = [];
    let remember_me: string | undefined = undefined;
    for (const c of cookie.split(";")) {
      const z = c.split("=");
      if (z[0].trim() == remember_me_cookie_name()) {
        // save it but do not include it in v, which will
        // be the new cookies values after going through
        // the proxy.
        remember_me = z[1].trim();
      } else {
        v.push(c);
      }
    }
    return { cookie: v.join(";"), remember_me };
  }
}
