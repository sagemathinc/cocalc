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

const { version } = require("smc-util/smc-version");
const { APP_BASE_URL } = require("./misc_page");
import { VERSION_COOKIE_NAME } from "smc-util/misc2";

// We don't really want this cookie to expire.  All it does is record the version of
// the code the client has loaded, and the version only goes up.
const days = 300;
const future = new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000);
const opts = { expires: future, path: "/", secure: true, sameSite: "none" };
const NAME = `${encodeURIComponent(APP_BASE_URL)}${VERSION_COOKIE_NAME}`;
cookies.set(`${NAME}`, version, opts);
// fallback legacy cookie -- https://web.dev/samesite-cookie-recipes/
const opts_leg = { expires: future, path: "/", secure: true };
cookies.set(`${NAME}-legacy`, version, opts_leg);
