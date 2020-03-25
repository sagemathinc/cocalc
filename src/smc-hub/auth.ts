//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
Passport Authentication (oauth, etc.)

Server-side setup
-----------------

In order to get this running, you have to manually setup each service.
That requires to register with the authentication provider, telling them about CoCalc,
the domain you use, the return path for the response, and adding the client identification
and corresponding secret keys to the database.
Then, the service is active and will be presented to the user on the sign up page.
The following is an example for setting up google oauth.
The other services are similar.

1. background: https://developers.google.com/identity/sign-in/web/devconsole-project
2. https://console.cloud.google.com/apis/credentials/consent
3. https://console.developers.google.com/apis/credentials → create credentials → oauth, ...
4. The return path for google is https://{DOMAIN_NAME}/auth/google/return
5. When done, there should be an entry under "OAuth 2.0 client IDs"
6. ... and you have your ID and secret!

Now, connect to the database, where the setup is in the passports_settings table:

1. there sould be a site_conf entry:
```
insert into passport_settings (strategy , conf ) VALUES ( 'site_conf', '{"auth": "https://[DOMAIN_NAME]/auth"}'::JSONB );
```
e.g., {"auth": "https://cocalc.com/auth"} is used on the live site
and   {"auth": "https://cocalc.com/[project_id]/port/8000/auth"} for a certain dev project.

2. insert into passport_settings (strategy , conf ) VALUES ( 'google', '{"clientID": "....apps.googleusercontent.com", "clientSecret": "..."}'::JSONB )

Then restart the hubs.
*/

import { series, parallel } from "async";
import { map as async_map } from "async";
import { callback2 } from "../smc-util/async-utils";
import * as uuid from "node-uuid";
import * as winston from "winston";
import * as passport from "passport";
const misc = require("smc-util/misc");
import message from "smc-util/message"; // message protocol between front-end and back-end
const { sign_in } = require("./sign-in");
import Cookies from "cookies";
import * as express_session from "express-session";
import { HELP_EMAIL } from "smc-util/theme";
import {
  email_verified_successfully,
  email_verification_problem,
  welcome_email
} from "./email";

const { defaults, required } = misc;

const api_key_cookie_name = base_url => base_url + "get_api_key";

// Nov'19: actually two cookies due to same-site changes.
// See https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients
export const remember_me_cookie_name = (base_url, legacy?) =>
  `${base_url}remember_me${!!legacy ? "-legacy" : ""}`;

//#######################################
// Password hashing
//#######################################

const password_hash_library = require("password-hash");
const crypto = require("crypto");

// You can change the parameters at any time and no existing passwords
// or cookies should break.  This will only impact newly created
// passwords and cookies.  Old ones can be read just fine (with the old
// parameters).
const HASH_ALGORITHM = "sha512";
const HASH_ITERATIONS = 1000;
const HASH_SALT_LENGTH = 32;

// This function is private and burried inside the password-hash
// library.  To avoid having to fork/modify that library, we've just
// copied it here.  We need it for remember_me cookies.
export function generate_hash(algorithm, salt, iterations, password): string {
  // there are cases where createHmac throws an error, because "salt" is undefined
  if (algorithm == null || salt == null) {
    throw new Error(
      `undefined arguments: algorithm='${algorithm}' salt='${salt}'`
    );
  }
  iterations = iterations || 1;
  let hash = password;
  for (
    let i = 1, end = iterations, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    hash = crypto
      .createHmac(algorithm, salt)
      .update(hash)
      .digest("hex");
  }
  return algorithm + "$" + salt + "$" + iterations + "$" + hash;
}

export function password_hash(password): string {
  // This blocks the server for about 5-9ms.
  return password_hash_library.generate(password, {
    algorithm: HASH_ALGORITHM,
    saltLength: HASH_SALT_LENGTH,
    iterations: HASH_ITERATIONS
  });
}

async function create_account(opts, email_address): Promise<string> {
  return await callback2(opts.database.create_account, {
    first_name: opts.first_name,
    last_name: opts.last_name,
    email_address,
    passport_strategy: opts.strategy,
    passport_id: opts.id,
    passport_profile: opts.profile
  });
}

function passport_login(opts) {
  let x;
  opts = defaults(opts, {
    database: required,
    strategy: required, // name of the auth strategy, e.g., 'google', 'facebook', etc.
    profile: required, // will just get saved in database
    id: required, // unique id given by oauth provider
    first_name: undefined,
    last_name: undefined,
    full_name: undefined,
    emails: undefined, // if user not logged in (via remember_me) already, and existing account with same email, and passport not created, then get an error instead of login or account creation.
    req: required, // request object
    res: required, // response object
    base_url: "",
    host: required,
    cb: undefined
  });

  const dbg = m => winston.debug(`passport_login: ${m}`);
  const BASE_URL = opts.base_url;

  dbg(misc.to_json(opts.req.user));

  interface Locals {
    new_account_created: boolean;
    has_valid_remember_me: boolean;
    account_id?: string;
    email_address?: string;
    target: string;
    cookies: any;
    remember_me_cookie: string;
    get_api_key?: string;
    action?: "regenerate" | "get";
    api_key?: string;
  }

  const cookies = new Cookies(opts.req, opts.res);
  const locals: Locals = {
    new_account_created: false,
    has_valid_remember_me: false,
    account_id: undefined,
    email_address: undefined,
    target: BASE_URL + "/app#login",
    cookies,
    remember_me_cookie: cookies.get(remember_me_cookie_name(BASE_URL)),
    get_api_key: cookies.get(api_key_cookie_name(BASE_URL))
  };

  //# dbg("cookies = '#{opts.req.headers['cookie']}'")  # DANGER -- do not uncomment except for debugging due to SECURITY
  dbg(`remember_me_cookie = '${locals.remember_me_cookie}'`);

  // check if user is just trying to get an api key.
  if (locals.get_api_key) {
    dbg("user is just trying to get api_key");
    // Set with no value **deletes** the cookie when the response is set. It's very important
    // to delete this cookie ASAP, since otherwise the user can't sign in normally.
    locals.cookies.set(api_key_cookie_name(BASE_URL));
  }

  if (
    opts.full_name != null &&
    opts.first_name == null &&
    opts.last_name == null
  ) {
    const name = opts.full_name;
    const i = name.lastIndexOf(" ");
    if (i === -1) {
      opts.first_name = "";
      opts.last_name = name;
    } else {
      opts.first_name = name.slice(0, i).trim();
      opts.last_name = name.slice(i).trim();
    }
  }

  opts.first_name = opts.first_name ?? "";
  opts.last_name = opts.last_name ?? "";

  if (opts.emails != null) {
    opts.emails = (() => {
      const result: string[] = [];
      for (x of opts.emails) {
        if (
          x != null &&
          x.toLowerCase != null &&
          misc.is_valid_email_address(x)
        ) {
          result.push(x.toLowerCase());
        }
      }
      return result;
    })();
  }

  opts.id = `${opts.id}`; // convert to string (id is often a number)

  series(
    [
      function(cb) {
        let hash;
        if (!locals.remember_me_cookie) {
          cb();
          return;
        }

        dbg("check if user has a valid remember_me cookie");
        const value = locals.remember_me_cookie;
        x = value.split("$");
        if (x.length !== 4) {
          dbg("badly formatted remember_me cookie");
          cb();
          return;
        }
        try {
          hash = generate_hash(x[0], x[1], x[2], x[3]);
        } catch (error) {
          const err = error;
          dbg(
            `unable to generate hash from remember_me cookie = '${locals.remember_me_cookie}' -- ${err}`
          );
          cb();
          return;
        }
        opts.database.get_remember_me({
          hash,
          cb(err, signed_in_mesg) {
            if (err) {
              cb(err);
            } else if (signed_in_mesg != null) {
              dbg("user does have valid remember_me token");
              locals.account_id = signed_in_mesg.account_id;
              locals.has_valid_remember_me = true;
              cb();
            } else {
              dbg("no valid remember_me token");
              cb();
            }
          }
        });
      },
      function(cb) {
        dbg(
          "check to see if the passport already exists indexed by the given id -- in that case we will log user in"
        );
        opts.database.passport_exists({
          strategy: opts.strategy,
          id: opts.id,
          cb(err, _account_id) {
            if (err) {
              cb(err);
            } else {
              if (!_account_id && locals.has_valid_remember_me) {
                dbg(
                  "passport doesn't exist, but user is authenticated (via remember_me), so we add this passport for them."
                );
                opts.database.create_passport({
                  account_id: locals.account_id,
                  strategy: opts.strategy,
                  id: opts.id,
                  profile: opts.profile,
                  email_address:
                    opts.emails != null ? opts.emails[0] : undefined,
                  first_name: opts.first_name,
                  last_name: opts.last_name,
                  cb
                });
              } else {
                if (
                  locals.has_valid_remember_me &&
                  locals.account_id !== _account_id
                ) {
                  dbg(
                    "passport exists but is associated with another account already"
                  );
                  cb(
                    `Your ${opts.strategy} account is already attached to another CoCalc account.  First sign into that account and unlink ${opts.strategy} in account settings if you want to instead associate it with this account.`
                  );
                } else {
                  if (locals.has_valid_remember_me) {
                    dbg(
                      "passport already exists and is associated to the currently logged into account"
                    );
                  } else {
                    dbg(
                      "passport exists and is already associated to a valid account, which we'll log user into"
                    );
                    locals.account_id = _account_id;
                  }
                  cb();
                }
              }
            }
          }
        });
      },
      function(cb) {
        if (locals.account_id || opts.emails == null) {
          cb();
          return;
        }
        dbg(
          "passport doesn't exist and emails available, so check for existing account with a matching email -- if we find one it's an error"
        );
        const f = function(email, cb) {
          if (locals.account_id) {
            dbg(
              `already found a match with account_id=${locals.account_id} -- done`
            );
            cb();
          } else {
            dbg(`checking for account with email ${email}...`);
            opts.database.account_exists({
              email_address: email.toLowerCase(),
              cb(err, _account_id) {
                if (locals.account_id) {
                  // already done, so ignore
                  dbg(
                    `already found a match with account_id=${locals.account_id} -- done`
                  );
                  cb();
                } else if (err || !_account_id) {
                  cb(err);
                } else {
                  locals.account_id = _account_id;
                  locals.email_address = email.toLowerCase();
                  dbg(
                    `found matching account ${locals.account_id} for email ${locals.email_address}`
                  );
                  cb(
                    `There is already an account with email address ${locals.email_address}; please sign in using that email account, then link ${opts.strategy} to it in account settings.`
                  );
                }
              }
            });
          }
        };
        async_map(opts.emails, f, cb);
      },
      async function(cb) {
        if (locals.account_id) {
          // account already made above
          cb();
          return;
        }
        dbg(
          "no existing account to link, so create new account that can be accessed using this passport"
        );
        if (opts.emails != null) {
          locals.email_address = opts.emails[0];
        }

        try {
          locals.account_id = await create_account(opts, locals.email_address);
          locals.new_account_created = true;
          if (locals.email_address != null) {
            await callback2(opts.database.do_account_creation_actions, {
              email_address: locals.email_address,
              account_id: locals.account_id
            });
          }
          // log this
          const data = {
            account_id: locals.account_id,
            first_name: opts.first_name,
            last_name: opts.last_name,
            email_address:
              locals.email_address != null ? locals.email_address : null,
            created_by: opts.req.ip
          };
          // no await -- don't let client wait for *logging* the fact that we created an account
          // failure wouldn't matter.
          opts.database.log({
            event: "create_account",
            value: data
          });
          cb();
        } catch (err) {
          cb(err);
        }
      },

      function(cb) {
        if (locals.new_account_created) {
          cb();
          return;
        }
        dbg(`record_sign_in: ${opts.req.url}`);
        sign_in.record_sign_in({
          ip_address: opts.req.ip,
          successful: true,
          remember_me: locals.has_valid_remember_me,
          email_address: locals.email_address,
          account_id: locals.account_id,
          database: opts.database
        });
        cb();
      }, // don't make client wait for this -- it's just a log message for us.

      function(cb) {
        if (!locals.get_api_key) {
          cb();
          return;
        }
        // Just handle getting api key here.
        const { api_key_action } = require("./api/manage"); // here, rather than at beginnig of file, due to some circular references...
        if (locals.new_account_created) {
          locals.action = "regenerate"; // obvious
        } else {
          locals.action = "get";
        }
        series(
          [
            cb =>
              api_key_action({
                database: opts.database,
                account_id: locals.account_id,
                passport: true,
                action: locals.action,
                cb: (err, api_key) => {
                  locals.api_key = api_key;
                  cb(err);
                }
              }),
            function(cb) {
              if (locals.api_key) {
                // got it above
                cb();
                return;
              }
              dbg(
                "get_api_key -- must generate key, since don't already have it"
              );
              api_key_action({
                database: opts.database,
                account_id: locals.account_id,
                passport: true,
                action: "regenerate",
                cb: (err, api_key) => {
                  locals.api_key = api_key;
                  cb(err);
                }
              });
            }
          ],
          function(err) {
            if (err) {
              cb(err);
            } else {
              // NOTE: See also code to generate similar URL in smc-webapp/account/init.ts
              locals.target = `https://authenticated?api_key=${locals.api_key}`;
              cb();
            }
          }
        );
      },

      (
        cb // check if user is banned:
      ) =>
        opts.database.is_banned_user({
          account_id: locals.account_id,
          cb(err, is_banned) {
            if (err) {
              cb(err);
              return;
            }
            if (is_banned) {
              cb(
                `User (account_id=${locals.account_id}, email_address=${locals.email_address}) is BANNED. ` +
                  `If this is a mistake, please contact ${HELP_EMAIL}.`
              );
              return;
            }
            cb();
          }
        }),
      function(cb) {
        if (locals.has_valid_remember_me) {
          cb();
          return;
        }

        dbg("passport created: set remember_me cookie, so user gets logged in");

        // create and set remember_me cookie, then redirect.
        // See the remember_me method of client for the algorithm we use.
        const signed_in_mesg = message.signed_in({
          remember_me: true,
          hub: opts.host,
          account_id: locals.account_id,
          first_name: opts.first_name,
          last_name: opts.last_name
        });

        dbg("create remember_me cookie");
        const session_id = uuid.v4();
        const hash_session_id = password_hash(session_id);
        const ttl = 24 * 3600 * 30; // 30 days
        x = hash_session_id.split("$");
        const remember_me_value = [x[0], x[1], x[2], session_id].join("$");

        dbg("set remember_me cookies in client");
        locals.cookies.set(
          remember_me_cookie_name(BASE_URL),
          remember_me_value,
          { maxAge: ttl * 1000 }
        );

        dbg("set remember_me cookie in database");
        opts.database.save_remember_me({
          account_id: locals.account_id,
          hash: hash_session_id,
          value: signed_in_mesg,
          ttl,
          cb
        });
      }
    ],
    function(err) {
      if (err) {
        opts.res.send(`Error trying to login using ${opts.strategy} -- ${err}`);
      } else {
        dbg("redirect the client");
        opts.res.redirect(locals.target);
      }
      typeof opts.cb === "function" ? opts.cb(err) : undefined;
    }
  );
} // end passport_login

export function init_passport(opts) {
  opts = defaults(opts, {
    router: required,
    database: required,
    base_url: required,
    host: required,
    cb: required
  });

  let { router, database, base_url, host, cb } = opts;
  // Initialize authentication plugins using Passport
  const dbg = m => winston.debug(`init_passport: ${m}`);
  dbg("");

  // initialize use of middleware
  router.use(express_session({ secret: misc.uuid() })); // secret is totally random and per-hub session
  router.use(passport.initialize());
  router.use(passport.session());

  // Define handler for api key cookie setting.
  const handle_get_api_key = function(req, res, next) {
    dbg("handle_get_api_key");
    if (req.query.get_api_key) {
      const cookies = new Cookies(req, res);
      // maxAge: User gets up to 60 minutes to go through the SSO process...
      cookies.set(api_key_cookie_name(base_url), req.query.get_api_key, {
        maxAge: 30 * 60 * 1000
      });
    }
    next();
  };

  // Define user serialization
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  const strategies: string[] = []; // configured strategies listed here.
  const get_conf = (strategy, cb) =>
    database.get_passport_settings({
      strategy,
      cb(err, settings) {
        if (err) {
          dbg(`error getting passport settings for ${strategy} -- ${err}`);
          cb(err);
        } else {
          if (settings != null) {
            if (strategy !== "site_conf") {
              strategies.push(strategy);
            }
            cb(undefined, settings);
          } else {
            dbg(`WARNING: passport strategy ${strategy} not configured`);
            cb(undefined, undefined);
          }
        }
      }
    });

  // Return the configured and supported authentication strategies.
  router.get("/auth/strategies", (_req, res) => res.json(strategies));

  router.get("/auth/verify", function(req, res) {
    const { DOMAIN_NAME } = require("smc-util/theme");
    base_url = require("./base-url").base_url();
    const path = require("path").join("/", base_url, "/app");
    const url = `${DOMAIN_NAME}${path}`;
    res.header("Content-Type", "text/html");
    res.header("Cache-Control", "private, no-cache, must-revalidate");
    if (!(req.query.token && req.query.email)) {
      res.send("ERROR: I need email and corresponding token data");
      return;
    }
    const email = decodeURIComponent(req.query.email);
    // .toLowerCase() on purpose: some crazy MTAs transform everything to uppercase!
    const token = req.query.token.toLowerCase();
    database.verify_email_check_token({
      email_address: email,
      token,
      cb(err) {
        if (err) {
          res.send(email_verification_problem(url, err));
        } else {
          res.send(email_verified_successfully(url));
        }
      }
    });
  });

  // Set the site conf like this:
  //
  //  require 'c'; db()
  //  db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cocalc.com/auth'}, cb:done())
  //
  //  or when doing development in a project  # TODO: far too brittle, especially the port/base_url stuff!
  //
  //  db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cocalc.com/project_uuid.../port/YYYYY/auth'}, cb:done())

  let auth_url = undefined; // gets set below

  function init_google(cb): void {
    dbg("init_google");
    // Strategy: Google OAuth 2 -- should be https://github.com/jaredhanson/passport-google-oauth2
    // but is https://github.com/passport-next/passport-google-oauth2
    // ATTENTION:
    // We have to use a fork of passport-google-oauth2, since jaredhanson is MIA.
    // See https://github.com/jaredhanson/passport-google-oauth2/pull/51/files
    const PassportStrategy = require("@passport-next/passport-google-oauth2")
      .Strategy;
    const strategy = "google";
    get_conf(strategy, function(err, conf) {
      if (err || conf == null) {
        cb(err);
        return;
      }
      // docs for getting these for your app
      // https://developers.google.com/accounts/docs/OpenIDConnect#appsetup
      //
      // You must then put them in the database, via
      //
      // require 'c'; db()
      // db.set_passport_settings(strategy:'google', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)
      opts = {
        clientID: conf.clientID,
        clientSecret: conf.clientSecret,
        callbackURL: `${auth_url}/${strategy}/return`
      };

      const verify = (_accessToken, _refreshToken, profile, done) =>
        done(undefined, { profile });
      passport.use(new PassportStrategy(opts, verify));

      winston.debug(`opts=${misc.to_json(opts)}`);

      // Enabling "profile" below I think required that I explicitly go to Google Developer Console for the project,
      // then select API&Auth, then API's, then Google+, then explicitly enable it.  Otherwise, stuff just mysteriously
      // didn't work.  To figure out that this was the problem, I had to grep the source code of the passport-google-oauth
      // library and put in print statements to see what the *REAL* errors were, since that
      // library hid the errors (**WHY**!!?).
      router.get(
        `/auth/${strategy}`,
        handle_get_api_key,
        passport.authenticate(strategy, { scope: "openid email profile" })
      );

      router.get(
        `/auth/${strategy}/return`,
        passport.authenticate(strategy),
        function(req, res) {
          const { profile } = req.user;
          passport_login({
            database,
            strategy,
            profile, // will just get saved in database
            id: profile.id,
            first_name: profile.name.givenName,
            last_name: profile.name.familyName,
            emails: profile.emails.map(x => x.value),
            req,
            res,
            base_url,
            host
          });
        }
      );

      cb();
    });
  }

  function init_github(cb): void {
    dbg("init_github");
    // Strategy: Github OAuth2 -- https://github.com/jaredhanson/passport-github
    const PassportStrategy = require("passport-github").Strategy;
    const strategy = "github";
    get_conf(strategy, function(err, conf) {
      if (err || conf == null) {
        cb(err);
        return;
      }
      // Get these here:
      //      https://github.com/settings/applications/new
      // You must then put them in the database, via
      //   db.set_passport_settings(strategy:'github', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

      opts = {
        clientID: conf.clientID,
        clientSecret: conf.clientSecret,
        callbackURL: `${auth_url}/${strategy}/return`
      };

      const verify = (_accessToken, _refreshToken, profile, done) =>
        done(undefined, { profile });
      passport.use(new PassportStrategy(opts, verify));

      router.get(
        `/auth/${strategy}`,
        handle_get_api_key,
        passport.authenticate(strategy)
      );

      router.get(
        `/auth/${strategy}/return`,
        passport.authenticate(strategy),
        function(req, res) {
          const { profile } = req.user;
          passport_login({
            database,
            strategy,
            profile, // will just get saved in database
            id: profile.id,
            full_name: profile.name || profile.displayName || profile.username,
            emails: (profile.emails != null ? profile.emails : []).map(
              x => x.value
            ),
            req,
            res,
            base_url,
            host
          });
        }
      );
      cb();
    });
  }

  function init_facebook(cb): void {
    dbg("init_facebook");
    // Strategy: Facebook OAuth2 --
    const PassportStrategy = require("passport-facebook").Strategy;
    const strategy = "facebook";
    get_conf(strategy, function(err, conf) {
      if (err || conf == null) {
        cb(err);
        return;
      }
      // Get these by going to https://developers.facebook.com/ and creating a new application.
      // For that application, set the url to the site CoCalc will be served from.
      // The Facebook "App ID" and is clientID and the Facebook "App Secret" is the clientSecret
      // for oauth2, as I discovered by a lucky guess... (sigh).
      //
      // You must then put them in the database, via
      //   db.set_passport_settings(strategy:'facebook', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

      opts = {
        clientID: conf.clientID,
        clientSecret: conf.clientSecret,
        callbackURL: `${auth_url}/${strategy}/return`,
        enableProof: false
      };

      const verify = (_accessToken, _refreshToken, profile, done) =>
        done(undefined, { profile });
      passport.use(new PassportStrategy(opts, verify));

      router.get(
        `/auth/${strategy}`,
        handle_get_api_key,
        passport.authenticate(strategy)
      );

      router.get(
        `/auth/${strategy}/return`,
        passport.authenticate(strategy),
        function(req, res) {
          const { profile } = req.user;
          passport_login({
            database,
            strategy,
            profile, // will just get saved in database
            id: profile.id,
            full_name: profile.displayName,
            req,
            res,
            base_url,
            host
          });
        }
      );

      cb();
    });
  }

  function init_twitter(cb): void {
    dbg("init_twitter");
    const PassportStrategy = require("passport-twitter").Strategy;
    const strategy = "twitter";
    get_conf(strategy, function(err, conf) {
      if (err || conf == null) {
        cb(err);
        return;
      }
      // Get these by:
      //    (1) Go to https://apps.twitter.com/ and create a new application.
      //    (2) Click on Keys and Access Tokens
      //
      // You must then put them in the database, via
      //   db.set_passport_settings(strategy:'twitter', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

      opts = {
        consumerKey: conf.clientID,
        consumerSecret: conf.clientSecret,
        callbackURL: `${auth_url}/${strategy}/return`
      };

      const verify = (_accessToken, _refreshToken, profile, done) =>
        done(undefined, { profile });
      passport.use(new PassportStrategy(opts, verify));

      router.get(
        `/auth/${strategy}`,
        handle_get_api_key,
        passport.authenticate(strategy)
      );

      router.get(
        `/auth/${strategy}/return`,
        passport.authenticate(strategy),
        function(req, res) {
          const { profile } = req.user;
          passport_login({
            database,
            strategy,
            profile, // will just get saved in database
            id: profile.id,
            full_name: profile.displayName,
            req,
            res,
            base_url,
            host
          });
        }
      );

      cb();
    });
  }

  series(
    [
      function(cb) {
        get_conf("site_conf", function(err, site_conf) {
          if (err) {
            cb(err);
          } else {
            if (site_conf != null) {
              auth_url = site_conf.auth;
              dbg(`auth_url='${auth_url}'`);
            }
            cb();
          }
        });
      },
      function(cb) {
        if (auth_url == null) {
          cb();
        } else {
          parallel([init_google, init_github, init_facebook, init_twitter], cb);
        }
      }
    ],
    err => {
      strategies.sort();
      strategies.unshift("email");
      cb(err);
    }
  );
}

// Password checking.  opts.cb(undefined, true) if the
// password is correct, opts.cb(error) on error (e.g., loading from
// database), and opts.cb(undefined, false) if password is wrong.  You must
// specify exactly one of password_hash, account_id, or email_address.
// In case you specify password_hash, in addition to calling the
// callback (if specified), this function also returns true if the
// password is correct, and false otherwise; it can do this because
// there is no async IO when the password_hash is specified.
export async function is_password_correct(opts): Promise<void> {
  opts = defaults(opts, {
    database: required,
    password: required,
    password_hash: undefined,
    account_id: undefined,
    email_address: undefined,
    allow_empty_password: false, // If true and no password set in account, it matches anything.
    // this is only used when first changing the email address or password
    // in passport-only accounts.
    cb: required
  }); // cb(err, true or false)

  if (opts.password_hash != null) {
    const r = password_hash_library.verify(opts.password, opts.password_hash);
    opts.cb(undefined, r);
  } else if (opts.account_id != null || opts.email_address != null) {
    try {
      const account = await callback2(opts.database.get_account, {
        account_id: opts.account_id,
        email_address: opts.email_address,
        columns: ["password_hash"]
      });

      if (opts.allow_empty_password && !account.password_hash) {
        if (opts.password && opts.account_id) {
          // Set opts.password as the password, since we're actually
          // setting the email address and password at the same time.
          opts.database.change_password({
            account_id: opts.account_id,
            password_hash: password_hash(opts.password),
            invalidate_remember_me: false,
            cb: err => opts.cb(err, true)
          });
        } else {
          opts.cb(undefined, true);
        }
      } else {
        opts.cb(
          undefined,
          password_hash_library.verify(opts.password, account.password_hash)
        );
      }
    } catch (error) {
      opts.cb(error);
    }
  } else {
    opts.cb(
      "One of password_hash, account_id, or email_address must be specified."
    );
  }
}

export async function verify_email_send_token(opts) {
  opts = defaults(opts, {
    database: required,
    account_id: required,
    only_verify: false,
    cb: required
  });

  try {
    const { token, email_address } = await callback2(
      opts.database.verify_email_create_token,
      {
        account_id: opts.account_id
      }
    );
    const settings = await callback2(
      opts.database.get_server_settings_cached,
      {}
    );
    await callback2(welcome_email, {
      to: email_address,
      token,
      only_verify: opts.only_verify,
      settings
    });
    opts.cb();
  } catch (err) {
    opts.cb(err);
  }
}
