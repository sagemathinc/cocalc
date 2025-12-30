/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

import Cookies from "cookies";
import dot from "dot-object";
import type { NextFunction, Request, Response } from "express";
import * as express from "express";
import express_session from "express-session";
import * as _ from "lodash";
import ms from "ms";
import passport, { AuthenticateOptions } from "passport";
import { join as path_join } from "path";
import safeJsonStringify from "safe-json-stringify";
import { v4 as uuidv4, v4 } from "uuid";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import base_path from "@cocalc/backend/base-path";
import { getLogger } from "@cocalc/backend/logger";
import { loadSSOConf } from "@cocalc/database/postgres/auth/load-sso-conf";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { getExtraStrategyConstructor } from "@cocalc/server/auth/sso/extra-strategies";
import { addUserProfileCallback } from "@cocalc/server/auth/sso/oauth2-user-profile-callback";
import { PassportLogin } from "@cocalc/server/auth/sso/passport-login";
import {
  InitPassport,
  LoginInfo,
  PassportManagerOpts,
  StrategyConf,
  StrategyInstanceOpts,
} from "@cocalc/server/auth/sso/types";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import { DNS } from "@cocalc/util/theme";
import {
  PRIMARY_SSO,
  PassportStrategyFrontend,
} from "@cocalc/util/types/passport-types";
import {
  email_verification_problem,
  email_verified_successfully,
  welcome_email,
} from "./email";
// NOTE: we do not install saml2js, outdated package, this is just for future reference and debugging
//import Saml2js from "saml2js";
import { WinstonLogger } from "@cocalc/backend/logger";
import {
  getOauthCache,
  getPassportCache,
} from "@cocalc/database/postgres/auth/passport-store";
import { getServerSettings } from "@cocalc/database/settings";
import {
  PassportLoginOpts,
  PassportStrategyDB,
  PassportStrategyDBConfig,
  PassportTypes,
  isOAuth2,
  isSAML,
} from "@cocalc/database/settings/auth-sso-types";
import { signInUsingImpersonateToken } from "@cocalc/server/auth/impersonate";
import {
  BLACKLISTED_STRATEGIES,
  DEFAULT_LOGIN_INFO,
  SSO_API_KEY_COOKIE_NAME,
} from "@cocalc/server/auth/sso/consts";
import {
  FacebookStrategyConf,
  GithubStrategyConf,
  GoogleStrategyConf,
  TwitterStrategyConf,
} from "@cocalc/server/auth/sso/public-strategies";
import siteUrl from "@cocalc/server/hub/site-url";

const logger = getLogger("server:hub:auth");

// primary strategies -- all other ones are "extra"
const PRIMARY_STRATEGIES = ["email", "site_conf", ...PRIMARY_SSO] as const;

// root for authentication related endpoints -- will be prefixed with the base_path
const AUTH_BASE = "/auth";

const { defaults, required } = misc;

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

interface HandleReturnOpts {
  Linit: WinstonLogger;
  name: string;
  type: PassportTypes;
  update_on_login: boolean;
  cookie_ttl_s: number | undefined;
  login_info: LoginInfo;
}

export class PassportManager {
  // express js, passed in from hub's main file
  private readonly router: express.Router;
  // the database, for various server queries
  private readonly database: PostgreSQL;
  // set in the hub, passed in -- not used by "site_conf", though
  private readonly host: string; // e.g. 127.0.0.1
  // configured strategies
  private passports: { [k: string]: PassportStrategyDB } | undefined =
    undefined;
  // prefix for those endpoints, where SSO services return back
  private auth_url: string | undefined = undefined;
  private site_url = `https://${DNS}${base_path}`; // updated during init

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
    if (this.passports != null) {
      logger.debug("already initialized -- just returning what we have");
      return this.passports;
    }
    try {
      // email is always included, if even email singup is disabled
      // use "register tokens" to restrict this method
      this.passports = {
        email: {
          strategy: "email",
          conf: { type: "email" },
          info: { public: true },
        },
      };
      const settings = await this.database.get_all_passport_settings();
      for (const setting of settings) {
        const name = setting.strategy;
        if (BLACKLISTED_STRATEGIES.includes(name as any)) {
          throw new Error(
            `It is not allowed to name a strategy endpoint "${name}", because it is used by the next.js /auth/* endpoint. See next/pages/auth/ROUTING.md for more information.`,
          );
        }
        // backwards compatibility
        const conf = setting.conf as any;
        setting.info = setting.info ?? {};
        if (setting.info.disabled ?? conf?.disabled ?? false) {
          continue;
        }
        for (const deprecated of [
          "public",
          "display",
          "icon",
          "exclusive_domains",
        ]) {
          if (setting.info[deprecated] == null) {
            setting.info[deprecated] = conf?.[deprecated];
          }
        }
        this.passports[setting.strategy] = setting;
      }
      return this.passports;
    } catch (err) {
      logger.debug(`error getting passport settings -- ${err}`);
      throw err;
    }
    return {};
  }

  // Define handler for api key cookie setting.
  private handle_get_api_key(req: Request, res: Response, next: NextFunction) {
    if (req.query.get_api_key) {
      logger.debug("handle_get_api_key");
      const cookies = new Cookies(req, res);
      // maxAge: User gets up to 60 minutes to go through the SSO process...
      cookies.set(SSO_API_KEY_COOKIE_NAME, req.query.get_api_key, {
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
    for (const name in this.passports) {
      if (name === "site_conf") continue;
      if (known.indexOf(name) >= 0) {
        data.push(name);
      }
    }
    res.json(data);
  }

  public get_strategies_v2(): PassportStrategyFrontend[] {
    const data: PassportStrategyFrontend[] = [];
    // we cast the result of _.pick to get more type saftey
    const keys = [
      "display",
      "type",
      "icon",
      "public",
      "exclusive_domains",
      "do_not_hide",
    ] as const;
    for (const name in this.passports) {
      if (name === "site_conf") continue;
      // this is sent to the web client → do not include any secret info!
      const info: PassportStrategyFrontend = {
        name,
        ...(_.pick(this.passports[name].info, keys) as {
          [key in (typeof keys)[number]]: any;
        }),
      };
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
    logger.debug("init");

    // initialize use of middleware
    this.router.use(express_session({ secret: v4() })); // secret is totally random and per-hub session
    this.router.use(passport.initialize());
    this.router.use(passport.session());

    // Define user serialization
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user: Express.User, done) => done(null, user));

    await loadSSOConf(this.database);

    // this.router endpoints setup
    this.init_strategies_endpoint();
    this.initImpersonate();
    this.init_email_verification();
    this.init_password_reset_token();

    // prerequisite for setting up any SSO endpoints
    await this.init_passport_settings();
    this.check_exclusive_domains_unique();

    this.site_url = await siteUrl();
    this.auth_url = await siteUrl(AUTH_BASE);
    logger.debug(`auth_url='${this.auth_url}'`);

    await Promise.all([
      this.initStrategy(GoogleStrategyConf),
      this.initStrategy(GithubStrategyConf),
      this.initStrategy(FacebookStrategyConf),
      this.initStrategy(TwitterStrategyConf),
      this.init_extra_strategies(),
    ]);
  }

  // check if exclusive domains are unique
  private check_exclusive_domains_unique() {
    const ret: { [k: string]: string } = {};
    for (const k in this.passports) {
      const v = this.passports[k];
      for (const domain of v.info?.exclusive_domains ?? []) {
        if (ret[domain] != null) {
          throw new Error(
            `exclusive domain '${domain}' defined by ${ret[domain]} and ${k}: they must be unique`,
          );
        }
        ret[domain] = k;
      }
    }
  }

  private init_strategies_endpoint(): void {
    // Return the configured and supported authentication strategies.
    this.router.get(`${AUTH_BASE}/strategies`, (req, res) => {
      if (req.query.v === "2") {
        this.strategies_v2(res);
      } else {
        this.strategies_v1(res);
      }
    });
  }

  private async init_email_verification(): Promise<void> {
    // email verification
    this.router.get(`${AUTH_BASE}/verify`, async (req, res) => {
      const url = await siteUrl("app");
      res.header("Content-Type", "text/html");
      res.header("Cache-Control", "no-cache, no-store");
      if (
        !(req.query.token && req.query.email) ||
        typeof req.query.email !== "string" ||
        typeof req.query.token !== "string"
      ) {
        res.send(
          "ERROR: I need the email address and the corresponding token data",
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
  }

  private init_password_reset_token(): void {
    // reset password: user email link contains a token, which we store in a session cookie.
    // this prevents leaking that token to 3rd parties as a referrer
    // endpoint has to match with @cocalc/hub/password
    this.router.get(`${AUTH_BASE}/password_reset`, async (req, res) => {
      if (typeof req.query.token !== "string") {
        res.send("ERROR: reset token must be set");
      } else {
        const token = req.query.token.toLowerCase();
        const cookies = new Cookies(req, res);
        // to match @cocalc/frontend/client/password-reset
        const name = encodeURIComponent(`${base_path}PWRESET`);
        const secure = req.protocol === "https";
        let sameSite;
        if (secure) {
          const { samesite_remember_me } = await getServerSettings();
          sameSite = samesite_remember_me;
        } else {
          sameSite = undefined;
        }

        cookies.set(name, token, {
          maxAge: ms("5 minutes"),
          secure,
          overwrite: true,
          httpOnly: false,
          sameSite,
        });
        res.redirect("../app");
      }
    });
  }

  /**
   * Default configuration options for certain authentication types.
   * Any one of these can be overridden by what's in "conf" in the database.
   */
  private get_extra_default_opts({
    name,
    type,
  }: {
    name: string;
    type: PassportTypes;
  }) {
    switch (type) {
      case "saml":
      case "saml-v3":
      case "saml-v4":
        // see https://github.com/node-saml/passport-saml#config-parameter-details
        const cachedMS = ms("8 hours");
        // Upgrading from SAML 3 to node-saml version 4 needs some extra config options.
        // They're not backwards compatible, so we need to check which version we're using!
        // 2024-02: we only have v4 now, so these addiitonal default values are always set.
        const patch = {
          audience: false, // Starting with version 4, this must be set (a string) or false.
          wantAuthnResponseSigned: false, // if not disabled, got an error with Google's Workspace SAML
        };
        return {
          acceptedClockSkewMs: ms("5 minutes"),
          cacheProvider: getPassportCache(name, cachedMS),
          digestAlgorithm: "sha256", // better than default sha1
          // if "*:persistent" doesn't work, use *:emailAddress
          identifierFormat:
            "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
          issuer: this.auth_url,
          requestIdExpirationPeriodMs: cachedMS,
          signatureAlgorithm: "sha256", // better than default sha1
          validateInResponseTo: "never", // default
          wantAssertionsSigned: true,
          ...patch,
        };
    }
  }

  private get_extra_opts(name: string, conf: PassportStrategyDBConfig) {
    // "extra_opts" is passed to the passport.js "Strategy" constructor!
    // e.g. arbitrary fields like a tokenURL will be extracted here, and then passed to the constructor
    const { type } = conf;
    const extracted = _.omit(conf, [
      "type", // not needed, we use it to pick the constructor
      "name", // deprecated, this is in the metadata "info" now
      "display", // --*--
      "icon", // --*--
      "login_info", // already extracted, see init_extra_strategies
      "clientID", // passed directly, follow opts in initStrategy
      "clientSecret", // --*--
      "userinfoURL", // --*--
      "public", // we don't need that info for initializing them
      "auth_opts", // we pass them as a separate parameter
    ]);

    const opts = {
      ...this.get_extra_default_opts({ name, type: conf.type }),
      ...extracted,
    };

    // node-saml>=5 renamed cert to idpCert (passport-saml dependency)
    // https://github.com/node-saml/node-saml/pull/343
    if (type === "saml" || type === "saml-v3" || type === "saml-v4") {
      // https://github.com/node-saml/node-saml/blob/master/README.md#security-and-signatures
      if (typeof opts.cert === "string") {
        opts.idpCert = opts.cert;
        delete opts.cert;
      }
      // https://github.com/node-saml/node-saml/blob/master/README.md
      // default is "never"
      if (typeof opts.validateInResponseTo === "boolean") {
        opts.validateInResponseTo = opts.validateInResponseTo
          ? "ifPresent"
          : "never";
      }
    }

    return opts;
  }

  // this maps additional strategy configurations to a list of StrategyConf objects
  // the overall goal is to support custom OAuth2 and LDAP endpoints, where additional
  // info is sent to the webapp client to properly present them. Google&co are "primary" configurations.
  //
  // here is one example what can be saved in the DB to make this work for a general OAuth2
  // if this SSO is not public (e.g. uni campus, company specific, ...) mark it as {"public":false}!
  //
  // insert into passport_settings (strategy, conf, info ) VALUES ( '[unique, e.g. "wowtech"]', '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "cocalc", "profile", ... depends on the config], "clientSecret": "[a password]", "authorizationURL": "https://domain.edu/.../oauth2/authorize", "userinfoURL" :"https://domain.edu/.../oauth2/userinfo",  "tokenURL":"https://domain.edu/.../oauth2/...extras.../access_token",  "login_info" : {"emails" :"emails[0].value"}}'::JSONB, {"display": "[user visible, e.g. "WOW Tech"]", "icon": "https://storage.googleapis.com/square.svg", "public": false}::JSONB);
  //
  // note, the login_info.emails string extracts from the profile object constructed by parse_openid_profile,
  // which is only triggered if there is such a "userinfoURL", which is OAuth2 specific.
  // other auth mechanisms might already provide the profile in passport.js's structure!
  private async init_extra_strategies(): Promise<void> {
    if (this.passports == null) throw Error("strategies not initalized!");
    const inits: Promise<void>[] = [];
    for (const [name, strategy] of Object.entries(this.passports)) {
      if (PRIMARY_STRATEGIES.indexOf(name as any) >= 0) {
        continue;
      }
      if (strategy.conf.type == null) {
        throw new Error(
          `all "extra" strategies must define their type, in particular also "${name}"`,
        );
      }

      const type: PassportTypes = strategy.conf.type;

      // the constructor
      const PassportStrategyConstructor = getExtraStrategyConstructor(type);

      const config: StrategyConf = {
        name,
        type,
        PassportStrategyConstructor,
        login_info: { ...DEFAULT_LOGIN_INFO, ...strategy.conf.login_info },
        userinfoURL: strategy.conf.userinfoURL,
        extra_opts: this.get_extra_opts(name, strategy.conf) as any, // TODO!
        update_on_login: strategy.info?.update_on_login ?? false,
        cookie_ttl_s: strategy.info?.cookie_ttl_s, // could be undefined, that's OK
        auth_opts: strategy.conf.auth_opts ?? {},
      } as const;

      inits.push(this.initStrategy(config));
    }
    await Promise.all(inits);
  }

  // this is the 2nd entry for the strategy, just a basic callback
  private getVerify(type: StrategyConf["type"]) {
    switch (type) {
      case "saml":
      case "saml-v3":
      case "saml-v4":
        return (profile, done) => {
          done(undefined, profile);
        };

      case "azuread":
        return (_iss, _sub, profile, _accessToken, _refreshToken, done) => {
          if (!profile.oid) {
            return done(new Error("No oid found"), null);
          }
          done(undefined, profile);
        };

      case "oidc":
        return (_issuer, profile, done) => {
          return done(undefined, profile);
        };

      default:
        return (_accessToken, _refreshToken, params, profile, done) => {
          done(undefined, { params, profile });
        };
    }
  }

  private getStrategyInstance(args: StrategyInstanceOpts) {
    const { type, opts, userinfoURL, PassportStrategyConstructor } = args;
    const L1 = logger.extend("getStrategyInstance");
    const L2 = L1.extend("userProfile").debug;

    const verify = this.getVerify(type);
    L1.silly({ type, opts, userinfoURL });
    const strategy_instance = new PassportStrategyConstructor(opts, verify);

    // for OAuth2, set the userinfoURL to get the profile
    if (userinfoURL != null) {
      addUserProfileCallback({ strategy_instance, userinfoURL, L2, type });
    }

    return strategy_instance;
  }

  private getHandleReturn(opts: HandleReturnOpts) {
    const { Linit, name, type, update_on_login, cookie_ttl_s, login_info } =
      opts;
    return async (req, res: express.Response) => {
      if (req.user == null) {
        throw Error("req.user == null -- that shouldn't happen");
      }
      const Lret = Linit.extend(`${name}/return`).debug;
      // usually, we pick the "profile", but in some cases like SAML this is in "attributes".
      // finally, as a fallback, we just take the ".user"
      // technically, req.user should never be undefined, though.
      // Example: 2023-10-11 for SAML v4 this is
      // req.user = {"issuer":"http://adfs.cornellcollege.edu/adfs/services/trust",
      // "inResponseTo":"_341e8226b4....","sessionIndex":"_...$...",
      // "nameID":"1234567890","email":"....@cornellcollege.edu",
      // "first_name":"[name]","last_name":"[name]"
      // "attributes":{"email":"...@cornellcollege.edu","first_name":"[name]","last_name":"[name]"}}

      Lret(`req.user = ${safeJsonStringify(req.user)}`);

      const profile_raw =
        req.user.profile != null
          ? req.user.profile
          : req.user.attributes != null
            ? req.user.attributes
            : req.user;

      // there are cases, where profile is a JSON string (e.g. oauth2next)
      let profile: passport.Profile;
      try {
        profile = (typeof profile_raw === "string"
          ? JSON.parse(profile_raw)
          : profile_raw) as any as passport.Profile;
      } catch (err) {
        Lret(`error parsing profile: ${err} -- ${profile_raw}`);
        const { help_email } = await cb2(
          this.database.get_server_settings_cached,
        );
        const err_msg = `Error trying to login using '${name}' -- if this problem persists please contact ${help_email} -- ${err}<br/><pre>${err.stack}</pre>`;
        Lret(`sending error "${err_msg}"`);
        res.send(err_msg);
        return;
      }

      if (isSAML(type)) {
        // the nameID is set via the conf.identifierFormat parameter – even if we set it to
        // persistent, we might still just get an email address, though
        Lret(`nameID format we actually got is ${req.user.nameIDFormat}`);
        profile.id = req.user.nameID;
      }

      Lret(`profile = ${safeJsonStringify(profile)}`);

      const login_opts: PassportLoginOpts = {
        passports: this.passports ?? {},
        database: this.database,
        host: this.host,
        id: profile.id, // ATTN: not all strategies have an ID → you have to derive the ID from the profile below via the "login_info" mapping (e.g. {id: "email"})
        strategyName: name,
        profile, // will just get saved in database
        update_on_login,
        cookie_ttl_s,
        req,
        res,
        site_url: this.site_url,
      };

      const dotInstance =
        typeof login_info._sep === "string" ? new dot(login_info._sep) : dot;

      for (const k in login_info) {
        if (k === "_sep") continue; // used above, not useful here
        const v = login_info[k];
        const param: string | string[] =
          typeof v == "function"
            ? // v is a LoginInfoDerivator<T>
              v(profile)
            : // v is a string for dot-object
              dotInstance.pick(v, profile);
        login_opts[k] = param;
      }

      const passportLogin = new PassportLogin(login_opts);
      try {
        await passportLogin.login();
      } catch (err) {
        let err_msg = "";
        // due to https://github.com/Microsoft/TypeScript/issues/13965 we have to check on name and can't use instanceof
        if (err.name === "PassportLoginError") {
          const signInUrl = path_join(base_path, "auth", "sign-in");
          err_msg = `Problem signing in using '${name}:<br/><strong>${
            err.message ?? `${err}`
          }</strong><br/><a href="${signInUrl}">Sign-in again</a>`;
        } else {
          const helpEmail = await passportLogin.getHelpEmail();
          err_msg = `Error trying to login using '${name}' -- if this problem persists please contact ${helpEmail} -- ${err}<br/><pre>${err.stack}</pre>`;
        }
        Lret(`sending error "${err_msg}"`);
        res.send(err_msg);
      }
    };
  }

  // right now, we only set this for OAauth2 (SAML knows what to do on its own)
  // This does not encode any information for now.
  private setState(
    name: string,
    type: PassportTypes,
    auth_opts: AuthenticateOptions,
  ) {
    return async (_req: Request, _res: Response, next: NextFunction) => {
      if (isOAuth2(type)) {
        const oauthcache = getOauthCache(name);
        const state = uuidv4();
        await oauthcache.saveAsync(state, `${Date.now()}`);
        auth_opts.state = state;
        logger.debug("session: " + auth_opts.state);
      }
      next();
    };
  }

  // corresponding check to setState above:
  // checks if the state data (w/ expiration) is still available.
  private checkState(name: string, type: PassportTypes) {
    const W = logger.extend(`checkState:${name}`).warn;
    return async (req: Request, _res: Response, next: NextFunction) => {
      if (isOAuth2(type)) {
        const oauthcache = getOauthCache(name);
        const state = req.query.state;
        if (typeof state !== "string") {
          const msg = `OAuth2 return error: 'state' is not a string: ${state}`;
          W(msg);
          return next(new Error(msg));
        }
        const saved_state = await oauthcache.getAsync(state);
        if (saved_state == null) {
          const msg = `OAuth2 return error: invalid state: ${state}`;
          W(msg);
          return next(new Error(msg));
        }
        await oauthcache.removeAsync(state);
      }
      next();
    };
  }

  // a generalized strategy initizalier
  private async initStrategy(strategy_config: StrategyConf): Promise<void> {
    const {
      name, // our "name" of the strategy, set in the DB
      type, // the "type", which is the key in the k
      PassportStrategyConstructor,
      extra_opts,
      auth_opts = {},
      login_info,
      userinfoURL,
      cookie_ttl_s,
      update_on_login = false,
    } = strategy_config;
    const Linit = logger.extend("init_strategy");
    const L = Linit.debug;

    L(`init_strategy ${name}`);
    if (this.passports == null) throw Error("strategies not initalized!");
    if (name == null) {
      L(`strategy name is null -- aborting initialization`);
      return;
    }

    const confDB = this.passports[name];
    if (confDB == null) {
      L(`no conf for strategy='${name}' in DB -- aborting initialization`);
      return;
    }

    // under the same name, we make it accessible
    const strategyUrl = `${AUTH_BASE}/${name}`;
    const returnUrl = `${strategyUrl}/return`;

    if (confDB.conf == null) {
      // This happened on *all* of my dev servers, etc.  -- William
      L(
        `strategy='${name}' is not properly configured -- aborting initialization`,
      );
      return;
    }

    const opts = {
      clientID: confDB.conf.clientID,
      clientSecret: confDB.conf.clientSecret,
      callbackURL: `${base_path.length > 1 ? base_path : ""}${returnUrl}`,
      // node-saml v5 needs this as well
      // https://github.com/node-saml/node-saml/blob/master/src/saml.ts#L95
      callbackUrl: `${base_path.length > 1 ? base_path : ""}${returnUrl}`,
      ...extra_opts,
    } as const;

    // attn: this log line shows secrets
    // logger.debug(`opts = ${safeJsonStringify(opts)}`);

    const strategy_instance = this.getStrategyInstance({
      type,
      opts,
      userinfoURL,
      PassportStrategyConstructor,
    });

    // this ties the name (our name set in the DB) to the strategy instance
    passport.use(name, strategy_instance);

    this.router.get(
      strategyUrl,
      this.handle_get_api_key,
      this.setState(name, type, auth_opts),
      passport.authenticate(name, auth_opts),
    );

    // this will hopefully do new PassportLogin().login()
    const handleReturn = this.getHandleReturn({
      Linit,
      name,
      type,
      update_on_login,
      cookie_ttl_s,
      login_info,
    });

    if (isSAML(type)) {
      this.router.post(
        returnUrl,
        // External use of the body-parser package is deprecated, so we are using express directly.
        // More precisely, body-parser is superseded by the version included inside express.
        express.urlencoded({ extended: false }),
        express.json(),
        passport.authenticate(name),
        async (req, res) => {
          // block below: boilerplate-code to parse the response from the SAML provider – could become helpful some day!
          //const xmlResponse = req.body.SAMLResponse;
          //if (xmlResponse == null) {
          //  throw new Error("SAML xmlResponse is null");
          //}
          //const samlRes = new Saml2js(xmlResponse);
          //if (req.user == null) req.user = {};
          //req.user["profile"] = samlRes.toObject();
          await handleReturn(req, res);
        },
      );
    } else if (isOAuth2(type)) {
      this.router.get(
        returnUrl,
        this.checkState(name, type),
        passport.authenticate(name),
        handleReturn,
      );
    } else {
      this.router.get(returnUrl, passport.authenticate(name), handleReturn);
    }
    L(`initialization of '${name}' at '${strategyUrl}' successful`);
  }

  // This is not really SSO, but we treat it in a similar way.
  private initImpersonate = () => {
    logger.debug("initImpersonate");
    this.router.get(`${AUTH_BASE}/impersonate`, (req, res) => {
      logger.debug("impersonate: handling an auth_token");
      signInUsingImpersonateToken({ req, res });
    });
  };
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

// NOTE: simpler clean replacement for this is in packages/server/auth/is-password-correct.ts
//
// Password checking.  opts.cb(undefined, true) if the
// password is correct, opts.cb(error) on error (e.g., loading from
// database), and opts.cb(undefined, false) if password is wrong.  You must
// specify exactly one of password_hash, account_id, or email_address.
// In case you specify password_hash, in addition to calling the
// callback (if specified), this function also returns true if the
// password is correct, and false otherwise; it can do this because
// there is no async IO when the password_hash is specified.
export async function is_password_correct(
  opts: IsPasswordCorrect,
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

  const { account_id, email_address } = opts;

  if (opts.password_hash != null) {
    const r = verifyPassword(opts.password, opts.password_hash);
    opts.cb(undefined, r);
  } else if (account_id != null || email_address != null) {
    try {
      const account = await cb2(opts.database.get_account, {
        account_id,
        email_address,
        columns: ["password_hash"],
      });

      if (opts.allow_empty_password && !account.password_hash) {
        if (opts.password && opts.account_id) {
          // Set opts.password as the password, since we're actually
          // setting the email address and password at the same time.
          opts.database.change_password({
            account_id: opts.account_id,
            password_hash: passwordHash(opts.password),
            invalidate_remember_me: false,
            cb: (err) => opts.cb(err, true),
          });
        } else {
          opts.cb(undefined, true);
        }
      } else {
        opts.cb(
          undefined,
          verifyPassword(opts.password, account.password_hash),
        );
      }
    } catch (error) {
      opts.cb(error);
    }
  } else {
    opts.cb(
      "One of password_hash, account_id, or email_address must be specified.",
    );
  }
}

/*
Send a verification email with a verification token in it.
*/
interface VerifyEmailOpts {
  database: PostgreSQL;
  account_id: string;
  only_verify: boolean;
  cb: (err?) => void;
}

export async function verify_email_send_token(opts: VerifyEmailOpts) {
  opts = defaults(opts, {
    database: required,
    account_id: required,
    only_verify: false,
    cb: required,
  });

  try {
    const { token, email_address } = await cb2<{
      token: string;
      email_address: string;
    }>(opts.database.verify_email_create_token, {
      account_id: opts.account_id,
    });
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
