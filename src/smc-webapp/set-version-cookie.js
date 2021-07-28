/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Set the not-secure cookie

[base-url]COCALC-VERSION

to the version of the client code.  This is used by the hub-proxy server on the
backend, to decide whether or not to allow the client to connect to projects.
Basically, we do not want to allow ancient buggy clients to connect in any
way at all.
*/

// https://github.com/reactivestack/cookies/tree/master/packages/universal-cookie#readme
import Cookies from "universal-cookie";
const cookies = new Cookies();

import { version } from "smc-util/smc-version";
import { versionCookieName } from "smc-util/consts";

// We don't really want this cookie to expire.  All it does is record the version of
// the code the client has loaded, and the version only goes up.  It does not provide
// any form of authentication.
const days = 300;
const future = new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000);
const opts = { expires: future, path: "/", secure: true, sameSite: "none" };
const NAME = versionCookieName(window.app_base_path);
cookies.set(NAME, version, opts);
