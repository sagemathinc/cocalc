/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/** This is called by a passport strategy endpoint (which is already setup) to actually
 * authenticate a user. This checks if there already exists an account, if not creates it, etc.
 * Checks if user info needs to be updated, and even checks if this is actually about
 * getting an API key.
 *
 * There are various details to consider as well.
 * 1. If you're signed in already and you're trying to sign in with a different account provided
 * via an SSO strategy, we link this passport to your exsiting account. There is just one exception,
 * which are SSO strategies which "exclusively" manage a domain.
 * 2. If you're not signed in and try to sign in, this checks if there is already an account – and creates it if not.
 * 3. If you sign in and the SSO strategy is set to "update_on_login", it will reset the name of the user to the
 * data from the SSO provider. However, the user can still modify the name.
 * 4. If you already have an email address belonging to a newly introduced exclusive domain, it will start to be controlled by it.
 */

import Cookies from "cookies";
import * as _ from "lodash";
import { isEmpty } from "lodash";
import base_path from "@cocalc/backend/base-path";
import getLogger from "@cocalc/backend/logger";
import { set_email_address_verified } from "@cocalc/database/postgres/account/queries";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import generateHash from "@cocalc/server/auth/hash";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { sanitizeID } from "@cocalc/server/auth/sso/sanitize-id";
import { sanitizeProfile } from "@cocalc/server/auth/sso/sanitize-profile";
import {
  PassportLoginLocals,
  PassportLoginOpts,
  PassportStrategyDB,
} from "@cocalc/database/settings/auth-sso-types";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { HELP_EMAIL } from "@cocalc/util/theme";
import getEmailAddress from "../../accounts/get-email-address";
import { emailBelongsToDomain, getEmailDomain } from "./check-required-sso";
import { SSO_API_KEY_COOKIE_NAME } from "./consts";
import isBanned from "@cocalc/server/accounts/is-banned";
import accountCreationActions from "@cocalc/server/accounts/account-creation-actions";
import clientSideRedirect from "@cocalc/server/auth/client-side-redirect";
import setSignInCookies from "@cocalc/server/auth/set-sign-in-cookies";

const logger = getLogger("server:auth:sso:passport-login");

export class PassportLogin {
  private readonly passports: { [k: string]: PassportStrategyDB } = {};
  //// this maps from exclusive email domains to the corresponding passport name
  private readonly database: PostgreSQL;
  // passed on to do the login
  private opts: PassportLoginOpts;

  constructor(opts: PassportLoginOpts) {
    const L = logger.extend("constructor").debug;

    this.passports = opts.passports;
    //this.exclusiveDomains = this.mapExclusiveDomains();
    this.database = opts.database;

    this.opts = opts;

    L({
      strategyName: opts.strategyName,
      profile: opts.profile,
      id: opts.id,
      first_name: opts.first_name,
      last_name: opts.last_name,
      full_name: opts.full_name,
      emails: opts.emails,
      update_on_login: opts.update_on_login,
      // FIXME: host field is probably not needed anywhere – kept for now to be compatible with old code
      host: opts.host,
    });
  }

  async login(): Promise<void> {
    const L = logger.extend("login").debug;

    // sanity checks
    if (this.opts.strategyName == null) {
      throw new Error("opts.strategyName must be defined");
    }
    if (this.passports?.[this.opts.strategyName] == null) {
      throw new Error(
        `passport strategy '${this.opts.strategyName}' does not exist`,
      );
    }
    if (!_.isPlainObject(this.opts.profile)) {
      throw new Error("opts.profile must be an object");
    }

    sanitizeID(this.opts);

    const cookies = new Cookies(this.opts.req, this.opts.res);

    // TODO: once this is settled, refactor this.opts and locals to be attributes of this short-living class.
    const locals: PassportLoginLocals = {
      cookies,
      new_account_created: false,
      has_valid_remember_me: false,
      account_id: undefined,
      email_address: undefined,
      target: base_path,
      remember_me_cookie: cookies.get(REMEMBER_ME_COOKIE_NAME),
      get_api_key: cookies.get(SSO_API_KEY_COOKIE_NAME),
      action: undefined,
      api_key: undefined,
    };

    // L( {remember_me_cookie : locals.remember_me_cookie})  // DANGER -- do not uncomment except for debugging due to SECURITY
    L(`remember_me_cookie is set: ${locals.remember_me_cookie?.length > 0}`);

    // check if user is just trying to get an api key.
    if (locals.get_api_key) {
      L("user is just trying to get api_key");
      // Set with no value **deletes** the cookie when the response is set. It's very important
      // to delete this cookie ASAP, since otherwise the user can't sign in normally.
      locals.cookies.set(SSO_API_KEY_COOKIE_NAME);
    }

    sanitizeProfile(this.opts, logger.extend("sanitizeProfile").debug);

    // L({ locals, opts }); // DANGER -- do not uncomment except for debugging due to SECURITY

    try {
      // do we have a valid remember me cookie for a given account_id already?
      await this.checkRememberMeCookie(locals);
      // do we already have a passport?
      await this.checkPassportExists(this.opts, locals);
      // there might be accounts already with that email address
      await this.checkExistingEmails(this.opts, locals);
      // if no account yet → create one
      await this.maybeCreateAccount(this.opts, locals);
      // if update_on_login is true, update the account with the new profile data
      await this.maybeUpdateAccountAndPassport(this.opts, locals);
      // check if user is banned?
      await this.isUserBanned(locals.account_id, locals.email_address);
      //  last step: set remember me cookie (for a  new sign in)
      await this.handleNewSignIn(this.opts, locals);
      // no exceptions → we're all good

      L(`redirect the client to '${locals.target}'`);
      // Doing a 302 redirect does NOT work because it doesn't send the cookie, due to
      // sameSite = 'strict'!!!
      // this.opts.res.redirect(locals.target);
      // See https://stackoverflow.com/questions/66675803/samesite-strict-cookies-are-not-included-in-302-redirects-when-user-clicks-link
      // WARNING: a 302 appears to work in dev mode, but that's only because
      // of all the hot module loading complexity.  Also, I could not get a meta redirect to work,
      // so had to use Javascript.
      clientSideRedirect({ res: this.opts.res, target: this.opts.site_url });
    } catch (err) {
      // this error is used to signal that the user has done something wrong (in a general sense)
      // and it shouldn't be the code or how it handles the returned data.
      // this is used to improve the feedback sent back to the user if there is a problem...
      err.name = "PassportLoginError";
      throw err;
    }
  } // end passport_login

  // retrieve the support help email address from the server settings
  async getHelpEmail(): Promise<string> {
    const settings = await cb2(this.database.get_server_settings_cached);
    return settings.help_email || HELP_EMAIL;
  }

  // Check for a valid remember me cookie.  If there is one, set
  // the account_id and has_valid_remember_me fields of locals.
  // If not, do NOTHING except log some debugging messages.  Does
  // not raise an exception.  See
  //     https://github.com/sagemathinc/cocalc/issues/4767
  // where this was failing the sign in if the remmeber me was
  // invalid in any way, which is overkill... since rememember_me
  // not being valid should just not entitle the user to having a
  // a specific account_id.
  private async checkRememberMeCookie(
    locals: PassportLoginLocals,
  ): Promise<void> {
    const L = logger.extend("check_remember_me_cookie").debug;
    if (!locals.remember_me_cookie) return;

    L("check if user has a valid remember_me cookie");
    const value = locals.remember_me_cookie;
    const x: string[] = value.split("$");
    if (x.length !== 4) {
      L("badly formatted remember_me cookie");
      return;
    }
    let hash;
    try {
      hash = generateHash(x[0], x[1], parseInt(x[2]), x[3]);
    } catch (error) {
      const err = error;
      L(
        `unable to generate hash from remember_me cookie = '${locals.remember_me_cookie}' -- ${err}`,
      );
    }
    if (hash != null) {
      const signed_in_mesg = await cb2(this.database.get_remember_me, {
        hash,
      });
      if (signed_in_mesg != null) {
        L("user does have valid remember_me token");
        locals.account_id = signed_in_mesg.account_id;
        locals.has_valid_remember_me = true;
      } else {
        L("no valid remember_me token");
        return;
      }
    }
  }

  // this adds a passport to an existing account
  private async createPassport(
    opts: PassportLoginOpts,
    locals: PassportLoginLocals,
  ) {
    if (locals.account_id == null) {
      throw new Error("createPassport: account_id is null");
    }
    await this.database.create_passport({
      account_id: locals.account_id,
      strategy: opts.strategyName,
      id: opts.id,
      profile: opts.profile,
      email_address: opts.emails != null ? opts.emails[0] : undefined,
      first_name: opts.first_name,
      last_name: opts.last_name,
    });
  }

  // this checks if the login info contains an email address, which belongs to an exclusive SSO strategy
  private checkExclusiveSSO(opts: PassportLoginOpts): boolean {
    const strategy = opts.passports[opts.strategyName];
    const exclusiveDomains = strategy.info?.exclusive_domains ?? [];
    if (!isEmpty(exclusiveDomains)) {
      for (const email of opts.emails ?? []) {
        const emailDomain = getEmailDomain(email.toLocaleLowerCase());
        for (const ssoDomain of exclusiveDomains) {
          if (emailBelongsToDomain(emailDomain, ssoDomain)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // similar to the above, for a specific email address
  private checkEmailExclusiveSSO(email_address): boolean {
    const emailDomain = getEmailDomain(email_address.toLocaleLowerCase());
    for (const strategyName in this.opts.passports) {
      const strategy = this.opts.passports[strategyName];
      for (const ssoDomain of strategy.info?.exclusive_domains ?? []) {
        if (emailBelongsToDomain(emailDomain, ssoDomain)) {
          return true;
        }
      }
    }
    return false;
  }

  // check, if depending on the strategy name and provided ID, we already know about that particular passport
  // this is in particular important, if e.g. a user A is signed in, but attempts to link to a passport X,
  // which is already associated with a user B. passports across all users are unique!
  // Exceptions apply to exclusive SSO strategies, which excert more control over the associated account.
  private async checkPassportExists(
    opts: PassportLoginOpts,
    locals: PassportLoginLocals,
  ): Promise<void> {
    const L = logger.extend("check_passport_exists").debug;
    L(
      "check to see if the passport already exists indexed by the given id -- in that case we will log user in",
    );

    const passport_account_id = await this.database.passport_exists({
      strategy: opts.strategyName,
      id: opts.id,
    });

    if (
      !passport_account_id &&
      locals.has_valid_remember_me &&
      locals.account_id != null
    ) {
      L(
        "passport doesn't exist, but user is authenticated (via remember_me), so we add this passport for them.",
      );

      // check if the email address of the passport is exclusive (which means we do not link to an existing account)
      if (this.checkExclusiveSSO(opts)) {
        throw new Error(
          `It is not possible to link this SSO ${
            opts.passports[opts.strategyName].info?.display ?? opts.strategyName
          } account to the account your're current logged in with. Please sign out first and then try signin in using this SSO account again.`,
        );
      }

      // we also check if the currently signed in user is goverend by an exclusive SSO domain
      // and prevent linking *another* SSO accoount (because this bypasses the exclusivity)
      const account_email_address = await getEmailAddress(locals.account_id);
      if (account_email_address != null) {
        if (this.checkEmailExclusiveSSO(account_email_address)) {
          throw new Error(
            `It is not possible to link any other SSO accounts to the account your're current logged in with.`,
          );
        }
      }

      // user authenticated, passport not known, adding to the user's account
      await this.createPassport(opts, locals);
    } else {
      if (
        locals.has_valid_remember_me &&
        locals.account_id !== passport_account_id
      ) {
        L("passport exists but is associated with another account already");
        throw Error(
          `Your ${opts.strategyName} account is already attached to another CoCalc account.  First sign into that account and unlink ${opts.strategyName} in account settings, if you want to instead associate it with this account.`,
        );
      } else {
        if (locals.has_valid_remember_me) {
          L(
            "passport already exists and is associated to the currently logged in account",
          );
        } else {
          L(
            "passport exists and is already associated to a valid account, which we'll log user into",
          );
          locals.account_id = passport_account_id;
        }
      }
    }
  }

  // If the SSO strategy provides one or more email addresses, we check if we already know these addresses!
  // This means a user can't "grab" some elses account, but has to sign in first (knowing the password)
  // and then link to the account. An exception are "exclusive" SSO strategies, which are all set to
  // control email addresses of their associated accounts (and well, users can only sign in using that SSO
  // strategy)
  private async checkExistingEmails(
    opts: PassportLoginOpts,
    locals: PassportLoginLocals,
  ): Promise<void> {
    const L = logger.extend("check_existing_emails").debug;
    // handle case where passport doesn't exist, but we know one or more email addresses → check for matching email
    if (locals.account_id != null || opts.emails == null) return;

    L(
      "passport doesn't exist but emails are available -- therefore check for existing account with a matching email -- if we find one it's an error, unless it's an 'exclusive' strategy, where we take over that account",
    );

    const strategy: PassportStrategyDB = opts.passports[opts.strategyName];

    // there is usually just one email in opts.emails, or an empty array
    for (const email of opts.emails) {
      const email_address = email.toLowerCase().trim();
      L(`checking for account with email ${email_address}...`);
      const existing_account_id = await cb2(this.database.account_exists, {
        email_address,
      });
      if (!existing_account_id) {
        L(`check_email: no existing_account_id for ${email}`);
      } else {
        locals.account_id = existing_account_id;
        locals.email_address = email_address;
        L(
          `found matching account ${locals.account_id} for email ${locals.email_address}`,
        );
        if (this.checkExclusiveSSO(opts)) {
          L(
            `email ${email_address} belongs to SSO strategy ${
              strategy.info?.display ?? opts.strategyName
            }, which exclusively manages all emails with domain in ${JSON.stringify(
              strategy.info?.exclusive_domains ?? [],
            )}`,
          );
          await this.createPassport(opts, locals);
          return;
        }

        // if there is no SSO mechanism with an exclusive email domain, we throw an error:
        throw Error(
          `There is already an account with email address ${locals.email_address}; please sign in using that email account, then link ${opts.strategyName} to it in account settings.`,
        );
      }
    }
  }

  // This calls the DB methods to create a new account, including the SSO passport configuration
  private async create_account(
    opts: PassportLoginOpts,
    email_address: string | undefined,
  ): Promise<string> {
    return await cb2(this.database.create_sso_account, {
      first_name: opts.first_name,
      last_name: opts.last_name,
      email_address,
      passport_strategy: opts.strategyName,
      passport_id: opts.id,
      passport_profile: opts.profile,
    });
  }

  // This calls the above, as long as we do not already have an account_id
  private async maybeCreateAccount(
    opts: PassportLoginOpts,
    locals: PassportLoginLocals,
  ): Promise<void> {
    if (locals.account_id) return;
    const L = logger.extend("maybe_create_account").debug;

    L(
      "no existing account to link, so create new account that can be accessed using this passport",
    );
    if (opts.emails != null) {
      locals.email_address = opts.emails[0];
    }
    L(`emails=${opts.emails} email_address=${locals.email_address}`);
    locals.account_id = await this.create_account(opts, locals.email_address);
    locals.new_account_created = true;

    // if we know the email address provided by t
    // we execute the account creation actions and set the address to be verified
    await accountCreationActions({
      email_address: locals.email_address,
      account_id: locals.account_id,
      // TODO: tags should be encoded in URL and passed here, but that's
      // not implemented
    });
    if (locals.email_address != null) {
      await set_email_address_verified({
        db: this.database,
        account_id: locals.account_id,
        email_address: locals.email_address,
      });
    }

    // log the newly created account
    const data = {
      account_id: locals.account_id,
      first_name: opts.first_name,
      last_name: opts.last_name,
      email_address: locals.email_address != null ? locals.email_address : null,
      created_by: opts.req.ip,
    } as const;

    // no await -- don't let client wait for *logging* the fact that we created an account
    // failure wouldn't matter.
    this.database.log({
      event: "create_account",
      value: data,
    });
  }

  // optionally, SSO strategies can be configured to always update fields of the user
  // with the data they provide. right now that's first and last name.
  // email address is a bit more tricky and not implemented.
  private async maybeUpdateAccountAndPassport(
    opts: PassportLoginOpts,
    locals: PassportLoginLocals,
  ) {
    // we only update if explicitly configured to do so
    if (!opts.update_on_login) return;

    if (locals.new_account_created || locals.account_id == null) return;
    const L = logger.extend("maybe_update_account_profile").debug;

    // if (opts.emails != null) {
    //   locals.email_address = opts.emails[0];
    // }

    L(`account exists and we update name of user based on SSO`);
    await this.database.update_account_and_passport({
      account_id: locals.account_id,
      first_name: opts.first_name,
      last_name: opts.last_name,
      strategy: opts.strategyName,
      id: opts.id,
      profile: opts.profile,
      // but not the email address, at least for now
      // email_address: locals.email_address,
      passport_profile: opts.profile,
    });
  }

  // ebfore recording the sign-in below, we check if a user is banned
  private async isUserBanned(account_id, email_address): Promise<boolean> {
    const is_banned = await isBanned(account_id);
    if (is_banned) {
      const helpEmail = await this.getHelpEmail();
      throw Error(
        `User (account_id=${account_id}, email_address=${email_address}) is BANNED. If this is a mistake, please contact ${helpEmail}.`,
      );
    }
    return is_banned;
  }

  // If we did end up here, and there wasn't already a valid remember me cookie,
  // we signed in a user. We record that and set the remember me cookie.
  // SSO strategies can configure the expiration of that cookie – e.g. super
  // paranoid ones can set this to 1 day.
  private async handleNewSignIn(
    { req, res }: PassportLoginOpts,
    locals: PassportLoginLocals,
  ): Promise<void> {
    if (locals.has_valid_remember_me) return;
    const L = logger.extend("handle_new_sign_in").debug;

    // make TS happy
    if (locals.account_id == null) {
      throw new Error("locals.account_id is null");
    }

    L("passport created: set remember_me cookie, so user gets logged in");

    L(`create remember_me cookie in database`);
    await setSignInCookies({
      account_id: locals.account_id,
      req,
      res,
    });
  }
}
