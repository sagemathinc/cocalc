/*

This gathering together some async utils.  Obviously should be moved
somewhere else when the dust settles!

The two helpful async/await libraries I found are:

   - https://github.com/hunterloftis/awaiting
   - https://github.com/masotime/async-await-utils

*/

import * as awaiting from "awaiting";

import { webapp_client } from "../webapp_client";

// turns a function of opts, which has a cb input into
// an async function that takes an opts with no cb as input.
export async function async_opts(f, opts) {
    function g(cb) {
        opts.cb = cb;
        f(opts);
    }
    return awaiting.callback(g);
}

// async version of the webapp_client exec -- let's you run any code in a project!
export async function exec(opts) {
    return async_opts(webapp_client.exec, opts);
}

