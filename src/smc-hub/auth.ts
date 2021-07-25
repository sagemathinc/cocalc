/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Passport Authentication (oauth, etc.)
//
// Server-side setup
// -----------------
//
// In order to get this running, you have to manually setup each service.
// That requires to register with the authentication provider, telling them about CoCalc,
// the domain you use, the return path for the response, and adding the client identification
// and corresponding secret keys to the database.
// Then, the service is active and will be presented to the user on the sign up page.
// The following is an example for setting up google oauth.
// The other services are similar.
//
// 1. background: https://developers.google.com/identity/sign-in/web/devconsole-project
// 2. https://console.cloud.google.com/apis/credentials/consent
// 3. https://console.developers.google.com/apis/credentials → create credentials → oauth, ...
// 4. The return path for google is https://{DOMAIN_NAME}/auth/google/return
// 5. When done, there should be an entry under "OAuth 2.0 client IDs"
// 6. ... and you have your ID and secret!
//
// Now, connect to the database, where the setup is in the passports_settings table:
//
// In older code, there was a "site_conf". We fix it to be $base_path/auth. There is no need to configure it, and existing configurations are ignored. Besides that, it wasn't properly used for all SSO strategies anyways …
//
// What's important is to configure the individual passport settings:
//
// 2. insert into passport_settings (strategy , conf ) VALUES ( 'google', '{"clientID": "....apps.googleusercontent.com", "clientSecret": "..."}'::JSONB )
//
// Then restart the hubs.

import { Router } from "express";
import * as ms from "ms";
import { callback2 as cb2 } from "smc-util/async-utils";
import * as debug from "debug";
const LOG = debug("hub:auth");
import { join as path_join } from "path";
import * as uuid from "node-uuid";
import * as passport from "passport";
import * as dot from "dot-object";
import * as _ from "lodash";
import * as misc from "smc-util/misc";
import * as message from "smc-util/message"; // message protocol between front-end and back-end
const sign_in = require("./sign-in");
import * as Cookies from "cookies";
import * as express_session from "express-session";
import { HELP_EMAIL, DNS } from "smc-util/theme";
import {
  email_verified_successfully,
  email_verification_problem,
  welcome_email,
} from "./email";
import { PostgreSQL } from "./postgres/types";
import {
  PassportStrategy,
  PRIMARY_SSO,
} from "smc-webapp/account/passport-types";
const safeJsonStringify = require("safe-json-stringify");
import base_path from "smc-util-node/base-path";

// primary strategies -- all other ones are "extra"
const PRIMARY_STRATEGIES = ["email", "site_conf", ...PRIMARY_SSO];

// root for authentication related endpoints -- will be prefixed with the base_path
const AUTH_BASE = "/auth";

type login_info_keys =
  | "id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "emails";

export interface PassportStrategyDB extends PassportStrategy {
  clientID?: string; // Google, Twitter, ... and OAuth2
  clientSecret?: string; // Google, Twitter, ... and OAuth2
  authorizationURL?: string; // OAuth2
  tokenURL?: string; // --*--
  userinfoURL?: string; // OAuth2, to get a profile
  login_info?: { [key in login_info_keys]?: string };
  public?: boolean; // if true it's a public SSO. this is only used in the UI, i.e. when there are no public ones, we allow token based email sign up
  disabled?: boolean; // if true, ignore this entry. default false.
  exclusive_domains?: string[];
}

const { defaults, required } = misc;

const API_KEY_COOKIE_NAME = base_path + "get_api_key";

// Nov'19: actually two cookies due to same-site changes.
// See https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients
export function remember_me_cookie_name(): string {
  return `${base_path.length <= 1 ? "" : encodeURIComponent(base_path)}remember_me`;
}

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
    hash = crypto.createHmac(algorithm, salt).update(hash).digest("hex");
  }
  return algorithm + "$" + salt + "$" + iterations + "$" + hash;
}

export function password_hash(password): string {
  // This blocks the server for about 5-9ms.
  return password_hash_library.generate(password, {
    algorithm: HASH_ALGORITHM,
    saltLength: HASH_SALT_LENGTH,
    iterations: HASH_ITERATIONS,
  });
}

interface PassportLogin {
  strategy: string;
  profile: any; // complex object
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  emails?: string[];
  req: any;
  res: any;
  host: any;
  cb: (err) => void;
}

// maps the full profile object to a string or list of strings (e.g. "first_name")
type LoginInfoDerivator<T> = (profile: any) => T;

interface StrategyConf {
  strategy: string;
  PassportStrategyConstructor: any;
  extra_opts?: {
    enableProof?: boolean; // facebook
    profileFields?: string[]; // facebook
    includeEmail?: boolean; // twitter
  };
  auth_opts?: passport.AuthenticateOptions;
  // return type has to partially fit with passport_login
  login_info: {
    id: string | LoginInfoDerivator<string>; // id is required!
    first_name?: string | LoginInfoDerivator<string>;
    last_name?: string | LoginInfoDerivator<string>;
    full_name?: string | LoginInfoDerivator<string>;
    emails?: string | LoginInfoDerivator<string[]>;
  };
  userinfoURL?: string; // OAuth2, to get a profile
}

// docs for getting these for your app
// https://developers.google.com/identity/protocols/oauth2/openid-connect#appsetup
// and https://console.developers.google.com/apis/credentials
//
// You must then put them in the database, via
//
// require 'c'; db()
// db.set_passport_settings(strategy:'google', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

// Scope:
// Enabling "profile" below I think required that I explicitly go to Google Developer Console for the project,
// then select API&Auth, then API's, then Google+, then explicitly enable it.  Otherwise, stuff just mysteriously
// didn't work.  To figure out that this was the problem, I had to grep the source code of the passport-google-oauth
// library and put in print statements to see what the *REAL* errors were, since that
// library hid the errors (**WHY**!!?).
const GoogleStrategyConf: StrategyConf = {
  strategy: "google",
  PassportStrategyConstructor: require("@passport-next/passport-google-oauth2")
    .Strategy,
  auth_opts: { scope: "openid email profile" },
  login_info: {
    id: (profile) => profile.id,
    first_name: (profile) => profile.name.givenName,
    last_name: (profile) => profile.name.familyName,
    emails: (profile) => profile.emails.map((x) => x.value as string),
  },
};

// Get these here:
//      https://github.com/settings/applications/new
// You must then put them in the database, via
//   db.set_passport_settings(strategy:'github', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

const GithubStrategyConf: StrategyConf = {
  strategy: "github",
  PassportStrategyConstructor: require("passport-github2").Strategy,
  auth_opts: {
    scope: ["user:email"],
  },
  login_info: {
    id: (profile) => profile.id,
    full_name: (profile) =>
      profile.name || profile.displayName || profile.username,
    emails: (profile) => (profile.emails ?? []).map((x) => x.value),
  },
};

// Get these by going to https://developers.facebook.com/ and creating a new application.
// For that application, set the url to the site CoCalc will be served from.
// The Facebook "App ID" and is clientID and the Facebook "App Secret" is the clientSecret
// for oauth2, as I discovered by a lucky guess... (sigh).
//
// You must then put them in the database, via
//   db.set_passport_settings(strategy:'facebook', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

const FacebookStrategyConf: StrategyConf = {
  strategy: "facebook",
  PassportStrategyConstructor: require("passport-facebook").Strategy,
  extra_opts: {
    enableProof: false,
    profileFields: ["id", "email", "name", "displayName"],
  },
  auth_opts: { scope: "email" },
  login_info: {
    id: (profile) => profile.id,
    full_name: (profile) => profile.displayName,
    emails: (profile) => (profile.emails ?? []).map((x) => x.value),
  },
};

// Get these by:
//    (1) Go to https://apps.twitter.com/ and create a new application.
//    (2) Click on Keys and Access Tokens
//
// You must then put them in the database, via
//   db.set_passport_settings(strategy:'twitter', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

const TwitterWrapper = (
  { clientID: consumerKey, clientSecret: consumerSecret, callbackURL },
  verify
) => {
  // cast to any, because otherwies TypeScript complains:
  // Only a void function can be called with the 'new' keyword.
  const TwitterStrat = require("passport-twitter").Strategy as any;
  return new TwitterStrat({ consumerKey, consumerSecret, callbackURL }, verify);
};

const TwitterStrategyConf: StrategyConf = {
  strategy: "twitter",
  PassportStrategyConstructor: TwitterWrapper,
  login_info: {
    id: (profile) => profile.id,
    full_name: (profile) => profile.displayName,
    emails: (profile) => (profile.emails ?? []).map((x) => x.value),
  },
  extra_opts: {
    includeEmail: true,
  },
};

// generalized OpenID (OAuth2) profile parser for the "userinfo" endpoint
// the returned structure matches passport.js's conventions
function parse_openid_profile(json: any) {
  const profile: any = {};
  profile.id = json.sub || json.id;
  profile.displayName = json.name;
  if (json.family_name || json.given_name) {
    profile.name = {
      familyName: json.family_name,
      givenName: json.given_name,
    };
    // no name? we use the email address
  } else if (json.email) {
    // don't include dots, because our "spam protection" rejects domain-like patterns
    const emailacc = json.email.split("@")[0].split(".");
    const [first, ...last] = emailacc; // last is always at least []
    profile.name = {
      givenName: first,
      familyName: last.join(" "),
    };
  }

  if (json.email) {
    profile.emails = [
      {
        value: json.email,
        verified: json.email_verified || json.verified_email,
      },
    ];
  }

  if (json.picture) {
    profile.photos = [{ value: json.picture }];
  }

  return profile;
}

interface InitPassport {
  router: Router;
  database: PostgreSQL;
  host: string;
  cb: (err?) => void;
}

// singleton
let pp_manager: PassportManager | null = null;

export function get_passport_manager() {
  return pp_manager;
}

export async function init_passport(opts: InitPassport) {
  opts = defaults(opts, {
    router: required,
    database: required,
    host: required,
    cb: required,
  });

  try {
    if (pp_manager == null) {
      pp_manager = new PassportManager(opts);
      await pp_manager.init();
    }
    opts.cb();
  } catch (err) {
    opts.cb(err);
  }
}

interface PassportManagerOpts {
  router: Router;
  database: PostgreSQL;
  host: string;
}

// passport_login state
interface PassportLoginLocals {
  dbg: any;   // InstanceType<typeof LOG> -- evidently, broken with current versions of things...
  account_id: string | undefined;
  email_address: string | undefined;
  new_account_created: boolean;
  has_valid_remember_me: boolean;
  target: string;
  cookies: any;
  remember_me_cookie: string;
  get_api_key: string;
  action: "regenerate" | "get" | undefined;
  api_key: string | undefined;
}

export class PassportManager {
  // express js, passed in from hub's main file
  readonly router: Router;
  // the database, for various server queries
  readonly database: PostgreSQL;
  // set in the hub, passed in -- not used by "site_conf", though
  readonly host: string; // e.g. 127.0.0.1
  // configured strategies
  private strategies: { [k: string]: PassportStrategyDB } | undefined =
    undefined;
  // prefix for those endpoints, where SSO services return back
  private auth_url: string | undefined = undefined;

  constructor(opts: PassportManagerOpts) {
    const { router, database, host } = opts;
    this.handle_get_api_key.bind(this);
    this.router = router;
    this.database = database;
    this.host = host;
  }

  private async init_passport_settings(): Promise<{
    [k: string]: PassportStrategyDB;
  }> {
    const dbg = LOG.extend("init_passport_settings");
    if (this.strategies != null) {
      dbg("already initialized -- just returning what we have");
      return this.strategies;
    }
    try {
      // we always offer email!
      this.strategies = { email: { name: "email" } };
      const settings = await cb2(this.database.get_all_passport_settings);
      for (const setting of settings) {
        const name = setting.strategy;
        const conf = setting.conf as PassportStrategyDB;
        if (conf.disabled === true) {
          continue;
        }
        conf.name = name;
        conf.public = setting.conf.public ?? true; // set the default
        this.strategies[name] = conf;
      }
      return this.strategies;
    } catch (err) {
      dbg(`error getting passport settings -- ${err}`);
      throw err;
    }
    return {};
  }

  // Define handler for api key cookie setting.
  private handle_get_api_key(req, res, next) {
    const dbg = LOG.extend("handle_get_api_key");
    dbg("");
    if (req.query.get_api_key) {
      const cookies = new Cookies(req, res);
      // maxAge: User gets up to 60 minutes to go through the SSO process...
      cookies.set(API_KEY_COOKIE_NAME, req.query.get_api_key, {
        maxAge: 30 * 60 * 1000,
      });
    }
    next();
  }

  // this is for pure backwards compatibility. at some point remove this!
  // it only returns a string[] array of the legacy authentication strategies
  private strategies_v1(res): void {
    const data: string[] = [];
    const known = ["email", ...PRIMARY_SSO];
    for (const name in this.strategies) {
      if (name === "site_conf") continue;
      if (known.indexOf(name) >= 0) {
        data.push(name);
      }
    }
    res.json(data);
  }

  public get_strategies_v2(): PassportStrategy[] {
    const data: PassportStrategy[] = [];
    for (const name in this.strategies) {
      if (name === "site_conf") continue;
      // this is sent to the web client → do not include any secret info!
      const info = _.pick(this.strategies[name], [
        "name",
        "display",
        "type",
        "icon",
        "public",
        "exclusive_domains",
      ]);
      data.push(info);
    }
    return data;
  }

  // version 2 tells the web client a little bit more.
  // the additional info is used to render customizeable SSO icons.
  private strategies_v2(res): void {
    res.json(this.get_strategies_v2());
  }

  async init(): Promise<void> {
    // Initialize authentication plugins using Passport
    const dbg = LOG.extend("init");
    dbg("");

    // initialize use of middleware
    this.router.use(express_session({ secret: uuid.v4() })); // secret is totally random and per-hub session
    this.router.use(passport.initialize());
    this.router.use(passport.session());

    // Define user serialization
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user: Express.User, done) => done(null, user));

    // Return the configured and supported authentication strategies.
    this.router.get(`${AUTH_BASE}/strategies`, (req, res) => {
      if (req.query.v === "2") {
        this.strategies_v2(res);
      } else {
        this.strategies_v1(res);
      }
    });

    // email verification
    this.router.get(`${AUTH_BASE}/verify`, async (req, res) => {
      const { DOMAIN_URL } = require("smc-util/theme");
      const path = require("path").join(base_path, "app");
      const url = `${DOMAIN_URL}${path}`;
      res.header("Content-Type", "text/html");
      res.header("Cache-Control", "private, no-cache, must-revalidate");
      if (
        !(req.query.token && req.query.email) ||
        typeof req.query.email !== "string" ||
        typeof req.query.token !== "string"
      ) {
        res.send(
          "ERROR: I need the email address and the corresponding token data"
        );
        return;
      }

      const email = decodeURIComponent(req.query.email);
      // .toLowerCase() on purpose: some crazy MTAs transform everything to uppercase!
      const token = req.query.token.toLowerCase();
      try {
        await cb2(this.database.verify_email_check_token, {
          email_address: email,
          token,
        });
        res.send(email_verified_successfully(url));
      } catch (err) {
        res.send(email_verification_problem(url, err));
      }
    });

    // reset password: user email link contains a token, which we store in a session cookie.
    // this prevents leaking that token to 3rd parties as a referrer
    // endpoint has to match with smc-hub/password
    this.router.get(`${AUTH_BASE}/password_reset`, (req, res) => {
      if (typeof req.query.token !== "string") {
        res.send("ERROR: reset token must be set");
      } else {
        const token = req.query.token.toLowerCase();
        const cookies = new Cookies(req, res);
        // to match smc-webapp/client/password-reset
        const name = encodeURIComponent(`${base_path}PWRESET`);
        cookies.set(name, token, {
          maxAge: ms("5 minutes"),
          secure: true,
          overwrite: true,
          httpOnly: false,
        });
        res.redirect("../app");
      }
    });

    // prerequisite for setting up any SSO endpoints
    await this.init_passport_settings();

    const settings = await cb2(this.database.get_server_settings_cached);
    const dns = settings.dns || DNS;
    this.auth_url = `https://${dns}${path_join(base_path, AUTH_BASE)}`;
    dbg(`auth_url='${this.auth_url}'`);

    await Promise.all([
      this.init_strategy(GoogleStrategyConf),
      this.init_strategy(GithubStrategyConf),
      this.init_strategy(FacebookStrategyConf),
      this.init_strategy(TwitterStrategyConf),
      this.init_extra_strategies(),
    ]);
  }

  private extra_strategy_constructor(name: string) {
    // LDAP via passport-ldapauth: https://github.com/vesse/passport-ldapauth#readme
    // OAuth2 via @passport-next/passport-oauth2: https://github.com/passport-next/passport-oauth2#readme
    // ORCID via passport-orcid: https://github.com/hubgit/passport-orcid#readme
    switch (name) {
      case "ldap":
        return require("passport-ldapauth").Strategy;
      case "oauth1":
        return require("passport-oauth").OAuthStrategy;
      case "oauth2":
        return require("passport-oauth").OAuth2Strategy;
      case "oauth2next":
        return require("@passport-next/passport-oauth2").Strategy;
      case "orcid":
        return require("passport-orcid").Strategy;
      case "saml":
        return require("passport-saml").Strategy;
      default:
        throw Error(`hub/auth: unknown extra strategy "${name}"`);
    }
  }

  // this maps additional strategy configurations to a list of StrategyConf objects
  // the overall goal is to support custom OAuth2 and LDAP endpoints, where additional
  // info is sent to the webapp client to properly present them. Google&co are "primary" configurations.
  //
  // here is one example what can be saved in the DB to make this work for a general OAuth2
  // if this SSO is not public (e.g. uni campus, company specific, ...) mark it as {"public":false}!
  //
  // insert into passport_settings (strategy, conf ) VALUES ( '[unique, e.g. "wowtech"]', '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "cocalc", "profile", ... depends on the config], "clientSecret": "[a password]", "authorizationURL": "https://domain.edu/.../oauth2/authorize", "userinfoURL" :"https://domain.edu/.../oauth2/userinfo",  "tokenURL":"https://domain.edu/.../oauth2/...extras.../access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "[user visible, e.g. "WOW Tech"]", "icon": "https://storage.googleapis.com/square.svg", "public": false}'::JSONB );
  //
  // note, the login_info.emails string extracts from the profile object constructed by parse_openid_profile,
  // which is only triggered if there is such a "userinfoURL", which is OAuth2 specific.
  // other auth mechanisms might already provide the profile in passport.js's structure!
  private async init_extra_strategies(): Promise<void> {
    if (this.strategies == null) throw Error("strategies not initalized!");
    const inits: Promise<void>[] = [];
    for (const [name, strategy] of Object.entries(this.strategies)) {
      if (PRIMARY_STRATEGIES.indexOf(name) >= 0) {
        continue;
      }
      if (strategy.type == null) {
        throw new Error(
          `all "extra" strategies must define their type, in particular also "${name}"`
        );
      }
      const cons = this.extra_strategy_constructor(strategy.type);
      // by default, all of these have .id, but we can overwrite them in the configuration's login_info field
      // the default below works well for OAuth2
      const dflt_login_info = {
        id: "id",
        first_name: "name.givenName",
        last_name: "name.familyName",
        emails: "emails[0].value",
      };
      const config: StrategyConf = {
        strategy: name,
        PassportStrategyConstructor: cons,
        login_info: Object.assign(dflt_login_info, strategy.login_info),
        userinfoURL: strategy.userinfoURL,
        // e.g. tokenURL will be extracted here, and then passed to the constructor
        extra_opts: _.omit(strategy, [
          "name",
          "display",
          "type",
          "icon",
          "clientID",
          "clientSecret",
          "userinfoURL",
          "public", // we don't need that info for initializing them
        ]) as any,
      };
      inits.push(this.init_strategy(config));
    }
    await Promise.all(inits);
  }

  // a generalized strategy initizalier
  private async init_strategy(strategy_config: StrategyConf): Promise<void> {
    const {
      strategy,
      PassportStrategyConstructor,
      extra_opts,
      auth_opts,
      login_info,
      userinfoURL,
    } = strategy_config;
    const dbg = LOG.extend(`init_strategy ${strategy}`);
    dbg("start");
    if (this.strategies == null) throw Error("strategies not initalized!");
    if (strategy == null) {
      dbg(`strategy is null -- aborting initialization`);
      return;
    }

    const conf = this.strategies[strategy];
    if (conf == null) {
      dbg(`conf is null -- aborting initialization`);
      return;
    }

    const opts = Object.assign(
      {
        clientID: conf.clientID,
        clientSecret: conf.clientSecret,
        callbackURL: `${this.auth_url}/${strategy}/return`,
      },
      extra_opts
    );

    // attn: this log line shows secrets
    // dbg(`opts = ${safeJsonStringify(opts)}`);

    const verify = (_accessToken, _refreshToken, params, profile, done) => {
      done(undefined, { params, profile });
    };

    const strategy_instance = new PassportStrategyConstructor(opts, verify);

    // OAuth2 userinfoURL: next to /authorize
    // https://github.com/passport-next/passport-oauth2/blob/master/lib/strategy.js#L276
    if (userinfoURL != null) {
      // closure captures "strategy"
      strategy_instance.userProfile = function userProfile(accessToken, done) {
        const dbg = LOG.extend("PassportStrategy").extend("userProfile");
        dbg(`userinfoURL=${userinfoURL}, accessToken=${accessToken}`);

        this._oauth2.useAuthorizationHeaderforGET(true);
        this._oauth2.get(userinfoURL, accessToken, (err, body) => {
          dbg(`get->body = ${body}`);

          let json;

          if (err) {
            dbg(
              `InternalOAuthError: Failed to fetch user profile -- ${safeJsonStringify(
                err
              )}`
            );

            if (err.data) {
              try {
                json = safeJsonStringify(err.data);
              } catch (_) {
                json = {};
              }
            }

            if (json && json.error && json.error_description) {
              return done(
                new Error(
                  `UserInfoError: ${json.error_description}, ${json.error}`
                )
              );
            }
            return done(
              new Error(
                `InternalOAuthError: Failed to fetch user profile -- ${safeJsonStringify(
                  err
                )}`
              )
            );
          }

          try {
            json = JSON.parse(body);
          } catch (ex) {
            return done(new Error(`Failed to parse user profile -- ${body}`));
          }

          const profile = parse_openid_profile(json);
          profile.provider = strategy;
          profile._raw = body;
          dbg(
            `PassportStrategyConstructor.userProfile: profile = ${safeJsonStringify(
              profile
            )}`
          );
          return done(null, profile);
        });
      };
    }

    passport.use(strategy, strategy_instance);

    this.router.get(
      `${AUTH_BASE}/${strategy}`,
      this.handle_get_api_key,
      passport.authenticate(strategy, auth_opts || {})
    );

    this.router.get(
      `${AUTH_BASE}/${strategy}/return`,
      passport.authenticate(strategy),
      async (req, res) => {
        const dbg2 = dbg.extend("router.get");
        if (req.user == null) {
          throw Error("req.user == null -- that shouldn't happen");
        }
        dbg2(`${strategy}/return user = ${safeJsonStringify(req.user)}`);
        const profile = req.user["profile"] as any as passport.Profile;
        dbg2(`${strategy}/return profile = ${safeJsonStringify(profile)}`);
        const login_opts = {
          strategy,
          profile, // will just get saved in database
          req,
          res,
          host: this.host,
        };
        for (const k in login_info) {
          const v = login_info[k];
          const param: string | string[] =
            typeof v == "function"
              ? // v is a LoginInfoDerivator<T>
                v(profile)
              : // v is a string for dot-object
                dot.pick(v, profile);
          Object.assign(login_opts, { [k]: param });
        }
        // this log line below suddenly produces a lot of output [rub, 2020-05-06]
        //dbg2(
        //  `login_opts = ${safeJsonStringify(_.omit(login_opts, ["req, res"]))}`
        //);
        await this.passport_login(login_opts as PassportLogin);
      }
    );
    dbg("initialization successful");
  }

  private async passport_login(opts: PassportLogin): Promise<void> {
    opts = defaults(opts, {
      strategy: required, // name of the auth strategy, e.g., 'google', 'facebook', etc.
      profile: required, // will just get saved in database
      id: required, // unique id given by oauth provider
      first_name: undefined,
      last_name: undefined,
      full_name: undefined,
      emails: undefined, // string or Array<string> if user not logged in (via remember_me) already, and existing account with same email, and passport not created, then get an error instead of login or account creation.
      req: required, // request object
      res: required, // response object
      host: required,
    });

    const dbg = LOG.extend("passport_login");
    const cookies = new Cookies(opts.req, opts.res);
    const locals: PassportLoginLocals = {
      dbg,
      cookies,
      new_account_created: false,
      has_valid_remember_me: false,
      account_id: undefined,
      email_address: undefined,
      target: path_join(base_path + "app#login"),
      remember_me_cookie: cookies.get(remember_me_cookie_name()),
      get_api_key: cookies.get(API_KEY_COOKIE_NAME),
      action: undefined,
      api_key: undefined,
    };

    //# dbg("cookies = '#{opts.req.headers['cookie']}'")  # DANGER -- do not uncomment except for debugging due to SECURITY
    dbg(
      `strategy=${opts.strategy} id=${opts.id} emails=${
        opts.emails
      } remember_me_cookie = '${
        locals.remember_me_cookie
      }' user=${safeJsonStringify(opts.req.user)}`
    );

    // check if user is just trying to get an api key.
    if (locals.get_api_key) {
      dbg("user is just trying to get api_key");
      // Set with no value **deletes** the cookie when the response is set. It's very important
      // to delete this cookie ASAP, since otherwise the user can't sign in normally.
      locals.cookies.set(API_KEY_COOKIE_NAME);
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
        const emails =
          typeof opts.emails == "string" ? [opts.emails] : opts.emails;
        const result: string[] = [];
        for (const x of emails) {
          if (typeof x === "string" && misc.is_valid_email_address(x)) {
            result.push(x.toLowerCase());
          }
        }
        return result;
      })();
    }

    opts.id = `${opts.id}`; // convert to string (id is often a number)

    try {
      // do we have a valid remember me cookie for a given account_id already?
      await this.check_remember_me_cookie(locals);
      // do we already have a passport?
      await this.check_passport_exists(opts, locals);
      // there might be accounts already with that email address
      await this.check_existing_emails(opts, locals);
      // if no account yet → create one
      await this.maybe_create_account(opts, locals);
      // record a sign-in activity, if we deal with an existing account
      await this.maybe_record_sign_in(opts, locals);
      // deal with the case where user wants an API key
      await this.maybe_provision_api_key(locals);
      // check if user is banned?
      await this.is_user_banned(locals.account_id, locals.email_address);
      //  last step: set remember me cookie (for a  new sign in)
      await this.handle_new_sign_in(opts, locals);
      // no exceptions → we're all good
      dbg(`redirect the client to '${locals.target}'`);
      opts.res.redirect(locals.target);
    } catch (err) {
      const err_msg = `Error trying to login using ${opts.strategy} -- ${err}`;
      dbg(`sending error "${err_msg}"`);
      opts.res.send(err_msg);
    }
  } // end passport_login

  // Check for a valid remember me cookie.  If there is one, set
  // the account_id and has_valid_remember_me fields of locals.
  // If not, do NOTHING except log some debugging messages.  Does
  // not raise an exception.  See
  //     https://github.com/sagemathinc/cocalc/issues/4767
  // where this was failing the sign in if the remmeber me was
  // invalid in any way, which is overkill... since rememember_me
  // not being valid should just not entitle the user to having a
  // a specific account_id.
  private async check_remember_me_cookie(
    locals: PassportLoginLocals
  ): Promise<void> {
    if (!locals.remember_me_cookie) return;
    const dbg = locals.dbg.extend("check_remember_me_cookie");

    dbg("check if user has a valid remember_me cookie");
    const value = locals.remember_me_cookie;
    const x: string[] = value.split("$");
    if (x.length !== 4) {
      dbg("badly formatted remember_me cookie");
      return;
    }
    let hash;
    try {
      hash = generate_hash(x[0], x[1], x[2], x[3]);
    } catch (error) {
      const err = error;
      dbg(
        `unable to generate hash from remember_me cookie = '${locals.remember_me_cookie}' -- ${err}`
      );
    }
    if (hash != null) {
      const signed_in_mesg = await cb2(this.database.get_remember_me, {
        hash,
      });
      if (signed_in_mesg != null) {
        dbg("user does have valid remember_me token");
        locals.account_id = signed_in_mesg.account_id;
        locals.has_valid_remember_me = true;
      } else {
        dbg("no valid remember_me token");
        return;
      }
    }
  }

  private async check_passport_exists(
    opts: PassportLogin,
    locals: PassportLoginLocals
  ): Promise<void> {
    const dbg = locals.dbg.extend("check_passport_exists");
    dbg(
      "check to see if the passport already exists indexed by the given id -- in that case we will log user in"
    );

    const _account_id = await cb2(this.database.passport_exists, {
      strategy: opts.strategy,
      id: opts.id,
    });

    if (
      !_account_id &&
      locals.has_valid_remember_me &&
      locals.account_id != null
    ) {
      dbg(
        "passport doesn't exist, but user is authenticated (via remember_me), so we add this passport for them."
      );
      await cb2(this.database.create_passport, {
        account_id: locals.account_id,
        strategy: opts.strategy,
        id: opts.id,
        profile: opts.profile,
        email_address: opts.emails != null ? opts.emails[0] : undefined,
        first_name: opts.first_name,
        last_name: opts.last_name,
      });
    } else {
      if (locals.has_valid_remember_me && locals.account_id !== _account_id) {
        dbg("passport exists but is associated with another account already");
        throw Error(
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
      }
    }
  }

  private async check_existing_emails(
    opts: PassportLogin,
    locals: PassportLoginLocals
  ): Promise<void> {
    // handle case where passport doesn't exist, but we know one or more email addresses → check for matching email
    if (locals.account_id != null || opts.emails == null) return;

    const dbg = locals.dbg.extend("check_existing_emails");

    dbg(
      "passport doesn't exist but emails are available -- therefore check for existing account with a matching email -- if we find one it's an error"
    );

    const check_emails = opts.emails.map(async (email) => {
      if (locals.account_id) {
        dbg(
          `already found a match with account_id=${locals.account_id} -- done`
        );
        return;
      } else {
        dbg(`checking for account with email ${email}...`);
        const _account_id = await cb2(this.database.account_exists, {
          email_address: email.toLowerCase(),
        });
        if (locals.account_id) {
          // already done, so ignore
          dbg(
            `already found a match with account_id=${locals.account_id} -- done`
          );
          return;
        } else if (!_account_id) {
          dbg(`check_email: no _account_id for ${email}`);
        } else {
          locals.account_id = _account_id;
          locals.email_address = email.toLowerCase();
          dbg(
            `found matching account ${locals.account_id} for email ${locals.email_address}`
          );
          throw Error(
            `There is already an account with email address ${locals.email_address}; please sign in using that email account, then link ${opts.strategy} to it in account settings.`
          );
        }
      }
    });
    await Promise.all(check_emails);
  }

  private async set_email_verified(
    account_id: string,
    email_address: string
  ): Promise<void> {
    return await cb2(this.database._query, {
      query: "UPDATE accounts",
      jsonb_set: { email_address_verified: { [email_address]: new Date() } },
      where: { "account_id = $::UUID": account_id },
    });
  }

  private async create_account(opts, email_address): Promise<string> {
    return await cb2(this.database.create_account, {
      first_name: opts.first_name,
      last_name: opts.last_name,
      email_address,

      passport_strategy: opts.strategy,
      passport_id: opts.id,
      passport_profile: opts.profile,
    });
  }

  private async maybe_create_account(
    opts: PassportLogin,
    locals: PassportLoginLocals
  ): Promise<void> {
    if (locals.account_id) return;

    const dbg = locals.dbg.extend("maybe_create_account");

    dbg(
      "no existing account to link, so create new account that can be accessed using this passport"
    );
    if (opts.emails != null) {
      locals.email_address = opts.emails[0];
    }
    dbg("emails=${opts.emails} email_address=${locals.email_address}");
    locals.account_id = await this.create_account(opts, locals.email_address);
    locals.new_account_created = true;

    // if we know the email address,
    // we execute the account creation actions and set the address to be verified
    if (locals.email_address != null) {
      const actions = cb2(this.database.do_account_creation_actions, {
        email_address: locals.email_address,
        account_id: locals.account_id,
      });
      const verify = this.set_email_verified(
        locals.account_id,
        locals.email_address
      );
      await Promise.all([actions, verify]);
    }

    // log the newly created account
    const data = {
      account_id: locals.account_id,
      first_name: opts.first_name,
      last_name: opts.last_name,
      email_address: locals.email_address != null ? locals.email_address : null,
      created_by: opts.req.ip,
    };

    // no await -- don't let client wait for *logging* the fact that we created an account
    // failure wouldn't matter.
    this.database.log({
      event: "create_account",
      value: data,
    });
  }

  private async maybe_record_sign_in(
    opts: PassportLogin,
    locals: PassportLoginLocals
  ): Promise<void> {
    if (locals.new_account_created) return;

    const dbg = locals.dbg.extend("maybe_record_sign_in");

    // don't make client wait for this -- it's just a log message for us.
    dbg(`no new account → record_sign_in: ${opts.req.ip}`);
    sign_in.record_sign_in({
      ip_address: opts.req.ip,
      successful: true,
      remember_me: locals.has_valid_remember_me,
      email_address: locals.email_address,
      account_id: locals.account_id,
      database: this.database,
    });
  }

  private async maybe_provision_api_key(
    locals: PassportLoginLocals
  ): Promise<void> {
    if (!locals.get_api_key) return;

    const dbg = locals.dbg.extend("maybe_provision_api_key");

    // Just handle getting api key here.
    const { api_key_action } = require("./api/manage"); // here, rather than at beginnig of file, due to some circular references...
    if (locals.new_account_created) {
      locals.action = "regenerate"; // obvious
    } else {
      locals.action = "get";
    }

    locals.api_key = await cb2(api_key_action, {
      database: this.database,
      account_id: locals.account_id,
      passport: true,
      action: locals.action,
    });

    // if there is no key
    if (!locals.api_key) {
      dbg("must generate key, since don't already have it");
      locals.api_key = await cb2(api_key_action, {
        database: this.database,
        account_id: locals.account_id,
        passport: true,
        action: "regenerate",
      });
    }
    // we got a key ...
    // NOTE: See also code to generate similar URL in smc-webapp/account/init.ts
    locals.target = `https://authenticated?api_key=${locals.api_key}`;
  }

  private async handle_new_sign_in(
    opts: PassportLogin,
    locals: PassportLoginLocals
  ): Promise<void> {
    if (locals.has_valid_remember_me) return;

    const dbg = locals.dbg.extend("handle_new_sign_in");

    // make TS happy
    if (locals.account_id == null) throw new Error("locals.account_id is null");

    dbg("passport created: set remember_me cookie, so user gets logged in");

    // create and set remember_me cookie, then redirect.
    // See the remember_me method of client for the algorithm we use.
    const signed_in_mesg = message.signed_in({
      remember_me: true,
      hub: opts.host,
      account_id: locals.account_id,
      first_name: opts.first_name,
      last_name: opts.last_name,
    });

    dbg("create remember_me cookie");
    const session_id = uuid.v4();
    const hash_session_id = password_hash(session_id);
    const ttl_s = 24 * 3600 * 30; // 30 days
    const x: string[] = hash_session_id.split("$");
    const remember_me_value = [x[0], x[1], x[2], session_id].join("$");

    dbg("save remember_me cookie in database");
    await cb2(this.database.save_remember_me, {
      account_id: locals.account_id,
      hash: hash_session_id,
      value: signed_in_mesg,
      ttl: ttl_s,
    });

    dbg("and also set remember_me cookie in client");
    locals.cookies.set(remember_me_cookie_name(), remember_me_value, {
      maxAge: ttl_s * 1000,
    });
  }

  private async is_user_banned(account_id, email_address): Promise<boolean> {
    const is_banned = await cb2(this.database.is_banned_user, {
      account_id,
    });
    if (is_banned) {
      const settings = await cb2(this.database.get_server_settings_cached);
      const email = settings.help_email || HELP_EMAIL;
      throw Error(
        `User (account_id=${account_id}, email_address=${email_address}) is BANNED. If this is a mistake, please contact ${email}.`
      );
    }
    return is_banned;
  }
}

interface IsPasswordCorrect {
  database: PostgreSQL;
  password: string;
  password_hash?: string;
  account_id?: string;
  email_address?: string;
  allow_empty_password?: boolean;
  cb: (err?, correct?: boolean) => void;
}

// Password checking.  opts.cb(undefined, true) if the
// password is correct, opts.cb(error) on error (e.g., loading from
// database), and opts.cb(undefined, false) if password is wrong.  You must
// specify exactly one of password_hash, account_id, or email_address.
// In case you specify password_hash, in addition to calling the
// callback (if specified), this function also returns true if the
// password is correct, and false otherwise; it can do this because
// there is no async IO when the password_hash is specified.
export async function is_password_correct(
  opts: IsPasswordCorrect
): Promise<void> {
  opts = defaults(opts, {
    database: required,
    password: required,
    password_hash: undefined,
    account_id: undefined,
    email_address: undefined,
    // If true and no password set in account, it matches anything.
    // this is only used when first changing the email address or password
    // in passport-only accounts.
    allow_empty_password: false,
    // cb(err, true or false)
    cb: required,
  });

  if (opts.password_hash != null) {
    const r = password_hash_library.verify(opts.password, opts.password_hash);
    opts.cb(undefined, r);
  } else if (opts.account_id != null || opts.email_address != null) {
    try {
      const account = await cb2(opts.database.get_account, {
        account_id: opts.account_id,
        email_address: opts.email_address,
        columns: ["password_hash"],
      });

      if (opts.allow_empty_password && !account.password_hash) {
        if (opts.password && opts.account_id) {
          // Set opts.password as the password, since we're actually
          // setting the email address and password at the same time.
          opts.database.change_password({
            account_id: opts.account_id,
            password_hash: password_hash(opts.password),
            invalidate_remember_me: false,
            cb: (err) => opts.cb(err, true),
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
    cb: required,
  });

  try {
    const { token, email_address } = await cb2(
      opts.database.verify_email_create_token,
      {
        account_id: opts.account_id,
      }
    );
    const settings = await cb2(opts.database.get_server_settings_cached);
    await cb2(welcome_email, {
      to: email_address,
      token,
      only_verify: opts.only_verify,
      settings,
    });
    opts.cb();
  } catch (err) {
    opts.cb(err);
  }
}
