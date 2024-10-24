/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// inherited legacy SSO defintiions – they're special cases, have their custom wrappers, etc.
// everything else is defined via a more general framework

import { StrategyConf, TwitterWrapper } from "@cocalc/server/auth/sso/types";
import { Strategy as GoogleStrategyOld } from "@passport-next/passport-google-oauth2";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GithubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import getLogger from "@cocalc/backend/logger";

const L = getLogger("auth:sso:public-strategies");

// docs for getting these for your app
// https://developers.google.com/identity/protocols/oauth2/openid-connect#appsetup
// and https://console.developers.google.com/apis/credentials
//
// You must then put them in the database, via
//
// require 'c'; db()
// db.set_passport_settings(strategy:'google', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

// In 2023, we got emails about a deprecated login method, which is very puzzling.
// In any case, the "passport-next" variant is a unmaintaned fork of a fork of the original.
// Here, we allow to switch to the "main" module, mentioned on the website and still maintained.
// However, both are 4 years old and didn't get any updates – not sure, though.
// Setting this env-variable will allow testing the main variant, instead of the one we have.
// If you read this in the future, we already tested it. Remove the passport-next variant.
const useMainGoogleSSO = process.env.COCALC_AUTH_GOOGLE_SSO === "oauth20"; // by default, uses old passport-next module
const googleSSOtype = (
  useMainGoogleSSO
    ? "passport-google-oauth20"
    : "@passport-next/passport-google-oauth2"
) as any;
L.info(`Google SSO uses '${googleSSOtype}'`);

// Scope:
// Enabling "profile" below I think required that I explicitly go to Google Developer Console for the project,
// then select API&Auth, then API's, then Google+, then explicitly enable it.  Otherwise, stuff just mysteriously
// didn't work.  To figure out that this was the problem, I had to grep the source code of the passport-google-oauth
// library and put in print statements to see what the *REAL* errors were, since that
// library hid the errors (**WHY**!!?).
export const GoogleStrategyConf: StrategyConf = {
  name: "google",
  type: googleSSOtype,
  PassportStrategyConstructor: useMainGoogleSSO
    ? GoogleStrategy
    : GoogleStrategyOld,
  auth_opts: { scope: "openid email profile" },
  login_info: {
    id: (profile) => profile.id,
    first_name: (profile) => profile.name?.givenName ?? "Anonymous",
    last_name: (profile) => profile.name?.familyName ?? "User",
    emails: (profile) => profile.emails?.map((x) => x.value as string) ?? [],
  },
};

// Get these here:
//      https://github.com/settings/applications/new
// You must then put them in the database, via
//   ~/cocalc/src/packages/server$ node
//   > db = require('@cocalc/database').db()
//   db.set_passport_settings({strategy:'github', conf:{clientID:'...',clientSecret:'...'}, cb:console.log})
//

export const GithubStrategyConf: StrategyConf = {
  name: "github",
  type: "passport-github2" as any,
  PassportStrategyConstructor: GithubStrategy,
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

export const FacebookStrategyConf: StrategyConf = {
  name: "facebook",
  type: "passport-facebook" as any,
  PassportStrategyConstructor: FacebookStrategy,
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

export const TwitterStrategyConf: StrategyConf = {
  name: "twitter",
  type: "passport-twitter" as any,
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
